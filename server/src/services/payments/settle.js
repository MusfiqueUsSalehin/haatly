import { ORDER_STATUS } from '../../constants/orders.js';
import { PAYMENT_STATUS, canMovePayment } from '../../constants/payments.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { AppError } from '../../utils/AppError.js';

/**
 * Move a payment to a new status, but only if it is still in `from`. Returns the updated
 * payment, or null when someone else got there first. This one atomic step is what makes
 * "payment confirmed" and "payment expired" safe to happen at the same moment.
 */
export async function movePayment({ code, from, to, note, now = new Date(), set = {} }) {
  if (!canMovePayment(from, to)) throw new Error(`a payment cannot go from ${from} to ${to}`);
  return Payment.findOneAndUpdate(
    { code, status: from },
    {
      $set: { status: to, ...set },
      $push: { history: { status: to, at: now, ...(note && { note }) } },
    },
    { returnDocument: 'after' },
  );
}

/**
 * Refund a successful payment in full. The gateway call carries the payment code as an
 * idempotency key, so a repeated attempt can never refund twice at the gateway.
 */
export async function refundPayment({ payment, provider, now = new Date() }) {
  if (!provider) throw new Error('no payment provider is configured to refund this payment');
  const { refundRef } = await provider.refund({
    providerRef: payment.providerRef,
    amountBdt: payment.amountBdt,
    idempotencyKey: payment.code,
  });
  const refunded = await movePayment({
    code: payment.code,
    from: PAYMENT_STATUS.SUCCEEDED,
    to: PAYMENT_STATUS.REFUNDED,
    note: `refund ${refundRef}`,
    now,
    set: { refundedBdt: payment.amountBdt },
  });
  if (refunded) await Order.updateOne({ code: payment.orderCode }, { paymentStatus: 'refunded' });
  return refunded;
}

/**
 * Settle the payment of an order that was just cancelled. Never throws on a gateway
 * problem: the order stays cancelled and the refund is retried later (see maintenance).
 */
export async function closePaymentForCancelledOrder({ order, provider, now = new Date(), logger }) {
  const payment = await Payment.findOne({ orderCode: order.code });
  if (!payment) return { outcome: 'no_payment' };

  if (payment.status === PAYMENT_STATUS.PENDING) {
    const cancelled = await movePayment({
      code: payment.code,
      from: PAYMENT_STATUS.PENDING,
      to: PAYMENT_STATUS.CANCELLED,
      note: 'order cancelled',
      now,
    });
    if (cancelled) return { outcome: 'cancelled' };
    // The payment landed at the very same moment: look again, and refund it.
    return closePaymentForCancelledOrder({ order, provider, now, logger });
  }

  if (payment.status === PAYMENT_STATUS.SUCCEEDED) {
    try {
      await refundPayment({ payment, provider, now });
      return { outcome: 'refunded' };
    } catch (err) {
      logger?.warn({ err, orderCode: order.code }, 'refund failed, it will be retried');
      return { outcome: 'refund_pending' };
    }
  }
  return { outcome: payment.status };
}

/**
 * Record that the rider collected the cash for a delivered cash-on-delivery order.
 * Safe to call twice. (The delivery step calls this in a later step.)
 */
export async function settleCashPayment({ orderCode, now = new Date() }) {
  const order = await Order.findOne({ code: orderCode });
  if (!order) throw new AppError(404, 'order_not_found', 'Order not found');
  if (order.paymentMethod !== 'cod') {
    throw new AppError(409, 'not_cash_order', 'This order was not paid in cash');
  }
  if (order.status !== ORDER_STATUS.DELIVERED) {
    throw new AppError(409, 'order_not_delivered', 'Cash is only collected on delivery');
  }

  const payment = await Payment.findOne({ orderCode });
  if (!payment) throw new AppError(404, 'payment_not_found', 'Payment not found');

  const paid = await movePayment({
    code: payment.code,
    from: PAYMENT_STATUS.PENDING,
    to: PAYMENT_STATUS.SUCCEEDED,
    note: 'cash collected',
    now,
  });
  const current = paid ?? (await Payment.findOne({ orderCode }));
  if (current.status !== PAYMENT_STATUS.SUCCEEDED) {
    throw new AppError(409, 'payment_not_settleable', `This payment is ${current.status}`);
  }
  await Order.updateOne({ code: orderCode }, { paymentStatus: 'paid' });
  return current;
}
