import { PAYMENT_STATUS } from '../../constants/payments.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { webhookEventSchema } from '../../schemas/payments.js';
import { AppError } from '../../utils/AppError.js';
import { verifySignature } from '../../utils/signature.js';
import { allocationsOf, cancelPlacedOrder } from '../orders/cancelOrder.js';
import { releaseStock } from '../orders/stock.js';
import { movePayment } from './settle.js';

const LATE_NOTE = 'late payment refunded';

/** Money arrived for an order that was already cancelled, failed or expired: give it back. */
async function refundLatePayment({ payment, provider, now }) {
  if (payment.history.some((entry) => entry.note?.startsWith(LATE_NOTE))) {
    return { outcome: 'duplicate' };
  }
  if (!provider) throw new AppError(503, 'payment_unavailable', 'Payments are not available');

  const { refundRef } = await provider.refund({
    providerRef: payment.providerRef,
    amountBdt: payment.amountBdt,
    idempotencyKey: `late-${payment.code}`,
  });
  await Payment.updateOne(
    { code: payment.code },
    { $push: { history: { status: payment.status, at: now, note: `${LATE_NOTE} ${refundRef}` } } },
  );
  return { outcome: 'refunded_late' };
}

async function onSucceeded({ payment, provider, now }) {
  let current = payment;

  if (current.status === PAYMENT_STATUS.PENDING) {
    const paid = await movePayment({
      code: current.code,
      from: PAYMENT_STATUS.PENDING,
      to: PAYMENT_STATUS.SUCCEEDED,
      note: 'wallet payment confirmed',
      now,
    });
    if (paid) {
      await Order.updateOne({ code: paid.orderCode }, { paymentStatus: 'paid' });
      return { outcome: 'paid' };
    }
    // Lost a race (cancelled or failed a moment ago): handle it as a late payment.
    current = await Payment.findOne({ code: current.code });
  }

  if (current.status === PAYMENT_STATUS.SUCCEEDED || current.status === PAYMENT_STATUS.REFUNDED) {
    return { outcome: 'duplicate' };
  }
  return refundLatePayment({ payment: current, provider, now });
}

async function onFailed({ payment, now }) {
  // A failure never undoes a payment that already settled, and never revives a cancelled one.
  if (payment.status !== PAYMENT_STATUS.PENDING) return { outcome: 'ignored' };

  const failed = await movePayment({
    code: payment.code,
    from: PAYMENT_STATUS.PENDING,
    to: PAYMENT_STATUS.FAILED,
    note: 'wallet payment failed',
    now,
  });
  if (!failed) return { outcome: 'ignored' };

  const order = await cancelPlacedOrder({ code: payment.orderCode, reason: 'payment_failed', now });
  if (order) await releaseStock(allocationsOf(order), now);
  return { outcome: 'failed' };
}

/**
 * Handle a payment event from the gateway. The signature (over the exact raw body and a
 * recent timestamp) is the only proof of who sent it. Events can arrive more than once or
 * out of order, so every outcome is safe to repeat.
 */
export async function handleWebhook({
  rawBody,
  timestamp,
  signature,
  secret,
  provider,
  now = new Date(),
}) {
  if (!verifySignature({ secret, timestamp, rawBody, signature, now })) {
    throw new AppError(401, 'invalid_signature', 'Invalid webhook signature');
  }

  let json;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new AppError(400, 'invalid_json', 'Webhook body is not valid JSON');
  }
  const parsed = webhookEventSchema.safeParse(json);
  if (!parsed.success) throw new AppError(400, 'invalid_event', 'Webhook event is not valid');
  const event = parsed.data;

  const payment = await Payment.findOne({ providerRef: event.providerRef });
  if (!payment) throw new AppError(404, 'payment_not_found', 'Unknown payment');
  if (payment.orderCode !== event.orderCode || payment.amountBdt !== event.amountBdt) {
    throw new AppError(400, 'payment_mismatch', 'The event does not match the payment');
  }

  return event.type === 'payment.succeeded'
    ? onSucceeded({ payment, provider, now })
    : onFailed({ payment, now });
}
