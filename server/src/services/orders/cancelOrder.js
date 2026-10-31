import { ORDER_STATUS } from '../../constants/orders.js';
import { Order } from '../../models/Order.js';
import { AppError } from '../../utils/AppError.js';
import { closePaymentForCancelledOrder } from '../payments/settle.js';
import { releaseStock } from './stock.js';
import { announceOrderUpdated } from '../../realtime/announce.js';

/** The kilos an order is holding, in the shape releaseStock() wants. */
export const allocationsOf = (order) =>
  order.items.flatMap((item) => item.allocations.map((a) => ({ lotCode: a.lotCode, kg: a.kg })));

/**
 * Atomically cancel an order that is still `placed`. Returns the cancelled order, or null
 * when it was no longer placed. Of several simultaneous callers, only one gets the order
 * back, and only that one may release its stock. Pass `customerId` to restrict it to one
 * customer's own order.
 */
export function cancelPlacedOrder({ code, customerId, reason, now = new Date() }) {
  return Order.findOneAndUpdate(
    { code, status: ORDER_STATUS.PLACED, ...(customerId && { customer: customerId }) },
    {
      $set: {
        status: ORDER_STATUS.CANCELLED,
        cancelledAt: now,
        ...(reason && { cancelReason: reason }),
      },
      $push: { statusHistory: { status: ORDER_STATUS.CANCELLED, at: now } },
    },
    { returnDocument: 'after' },
  );
}

/**
 * Cancel a customer's own order, and only while it has not left for delivery. The winner
 * puts the kilos back and settles the payment: an unpaid payment is cancelled, a paid
 * wallet payment is refunded (or queued for a retry if the gateway is down).
 */
export async function cancelOrder({
  customer,
  code,
  reason,
  provider = null,
  now = new Date(),
  logger,
}) {
  const order = await cancelPlacedOrder({ code, customerId: customer._id, reason, now });

  if (!order) {
    const existing = await Order.findOne({ code, customer: customer._id });
    if (!existing) throw new AppError(404, 'order_not_found', 'Order not found');
    const why =
      existing.status === ORDER_STATUS.CANCELLED
        ? 'This order is already cancelled'
        : `This order is ${existing.status.replaceAll('_', ' ')} and can no longer be cancelled`;
    throw new AppError(409, 'order_not_cancellable', why);
  }

  await releaseStock(allocationsOf(order), now);
  await closePaymentForCancelledOrder({ order, provider, now, logger });
  await announceOrderUpdated(code);
  return (await Order.findOne({ code })) ?? order; // re-read: the payment status may have changed
}
