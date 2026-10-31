import { Order } from '../models/Order.js';
import { Run } from '../models/Run.js';
import { publish } from './events.js';

/** Run a lookup + publish. Whatever goes wrong, the caller is never affected. */
async function safely(task) {
  try {
    await task();
  } catch {
    // Live updates are a convenience: they must never break checkout, payment or delivery.
  }
}

function countStops(stops) {
  const counts = { pending: 0, delivered: 0, failed: 0, skipped: 0 };
  for (const stop of stops) counts[stop.status] += 1;
  return counts;
}

/** A new order exists. Pass the order that was just saved. */
export const announceOrderPlaced = (order) =>
  safely(async () => {
    publish('order.placed', {
      orderCode: order.code,
      customerId: String(order.customer),
      cityCode: order.cityCode,
      zoneCode: order.zoneCode,
      totalBdt: order.totalBdt,
      paymentMethod: order.paymentMethod,
    });
  });

/** An order's status or payment status changed. Reads the current state itself. */
export const announceOrderUpdated = (orderCode) =>
  safely(async () => {
    const order = await Order.findOne({ code: orderCode })
      .select('code customer status paymentStatus')
      .lean();
    if (!order) return;
    publish('order.updated', {
      orderCode: order.code,
      customerId: String(order.customer),
      status: order.status,
      paymentStatus: order.paymentStatus,
    });
  });

/** A run was created, or its progress changed. Pass the run document or its code. */
export const announceRun = (runOrCode, type = 'updated') =>
  safely(async () => {
    const run = typeof runOrCode === 'string' ? await Run.findOne({ code: runOrCode }) : runOrCode;
    if (!run) return;
    publish(type === 'created' ? 'run.created' : 'run.updated', {
      runCode: run.code,
      riderId: String(run.rider),
      cityCode: run.cityCode,
      status: run.status,
      stopCount: run.stops.length,
      counts: countStops(run.stops),
    });
  });
