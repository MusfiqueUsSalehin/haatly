import { ORDER_STATUS } from '../../constants/orders.js';
import { PAYMENT_STATUS } from '../../constants/payments.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { allocationsOf, cancelPlacedOrder } from '../orders/cancelOrder.js';
import { releaseStock } from '../orders/stock.js';
import { movePayment, refundPayment } from './settle.js';

/**
 * Cancel wallet orders nobody paid for in time and put their stock back. The payment is
 * claimed first with one atomic step, so if the customer's payment confirms at the same
 * moment, exactly one of the two wins. Returns how many orders were expired.
 */
export async function expireUnpaidOrders(now = new Date()) {
  const due = await Payment.find({
    method: 'wallet',
    status: PAYMENT_STATUS.PENDING,
    expiresAt: { $lte: now },
  })
    .select('code orderCode')
    .lean();

  let expired = 0;
  for (const { code, orderCode } of due) {
    const claimed = await movePayment({
      code,
      from: PAYMENT_STATUS.PENDING,
      to: PAYMENT_STATUS.CANCELLED,
      note: 'payment window expired',
      now,
    });
    if (!claimed) continue;

    const order = await cancelPlacedOrder({ code: orderCode, reason: 'payment_expired', now });
    if (order) await releaseStock(allocationsOf(order), now);
    expired += 1;
  }
  return expired;
}

/**
 * Finish refunds that failed earlier (the gateway was down when the customer cancelled).
 * These are cancelled wallet orders whose payment still shows as paid.
 */
export async function retryRefunds({ provider, now = new Date(), logger } = {}) {
  if (!provider) return { retried: 0, refunded: 0 };

  const stuck = await Order.find({
    status: ORDER_STATUS.CANCELLED,
    paymentMethod: 'wallet',
    paymentStatus: 'paid',
  })
    .select('code')
    .lean();

  let refunded = 0;
  for (const { code } of stuck) {
    const payment = await Payment.findOne({ orderCode: code, status: PAYMENT_STATUS.SUCCEEDED });
    if (!payment) continue;
    try {
      if (await refundPayment({ payment, provider, now })) refunded += 1;
    } catch (err) {
      logger?.warn({ err, orderCode: code }, 'refund retry failed');
    }
  }
  return { retried: stuck.length, refunded };
}

/** The job to run every few minutes. */
export async function runPaymentMaintenance({ provider, now = new Date(), logger } = {}) {
  const expired = await expireUnpaidOrders(now);
  const { retried, refunded } = await retryRefunds({ provider, now, logger });
  return { expired, retried, refunded };
}
