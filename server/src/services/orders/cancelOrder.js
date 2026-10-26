import { ORDER_STATUS } from '../../constants/orders.js';
import { Order } from '../../models/Order.js';
import { AppError } from '../../utils/AppError.js';
import { releaseStock } from './stock.js';

/**
 * Cancel a customer's own order, and only while it has not left for delivery.
 * The status change is one atomic step: of two simultaneous cancels exactly one wins,
 * and only the winner puts the kilos back, so stock can never be restored twice.
 */
export async function cancelOrder({ customer, code, reason, now = new Date() }) {
  const order = await Order.findOneAndUpdate(
    { code, customer: customer._id, status: ORDER_STATUS.PLACED },
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

  if (!order) {
    const existing = await Order.findOne({ code, customer: customer._id });
    if (!existing) throw new AppError(404, 'order_not_found', 'Order not found');
    const why =
      existing.status === ORDER_STATUS.CANCELLED
        ? 'This order is already cancelled'
        : `This order is ${existing.status.replace(/_/g, ' ')} and can no longer be cancelled`;
    throw new AppError(409, 'order_not_cancellable', why);
  }

  await releaseStock(
    order.items.flatMap((item) => item.allocations.map((a) => ({ lotCode: a.lotCode, kg: a.kg }))),
    now,
  );
  return order;
}
