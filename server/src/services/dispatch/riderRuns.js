import { MAX_OTP_ATTEMPTS, RUN_STATUS, STOP_STATUS } from '../../constants/dispatch.js';
import { Order } from '../../models/Order.js';
import { Run } from '../../models/Run.js';
import { AppError } from '../../utils/AppError.js';
import { verifyOtp } from '../../utils/otp.js';
import { settleCashPayment } from '../payments/settle.js';
import { announceOrderUpdated, announceRun } from '../../realtime/announce.js';

/** A run is completed once none of its stops is still pending. */
const finishIfDone = (code, now) =>
  Run.updateOne(
    {
      code,
      status: RUN_STATUS.IN_PROGRESS,
      stops: { $not: { $elemMatch: { status: STOP_STATUS.PENDING } } },
    },
    { $set: { status: RUN_STATUS.COMPLETED, completedAt: now } },
  );

/** Load a rider's own run and one of its stops. Another rider's run looks like no run. */
async function loadStop({ rider, code, orderCode }) {
  const run = await Run.findOne({ code, rider: rider._id });
  if (!run) throw new AppError(404, 'run_not_found', 'Run not found');
  const stop = run.stops.find((s) => s.orderCode === orderCode);
  if (!stop) throw new AppError(404, 'stop_not_found', 'Stop not found');
  if (run.status !== RUN_STATUS.IN_PROGRESS) {
    throw new AppError(409, 'run_not_in_progress', 'Start the run first');
  }
  if (stop.status !== STOP_STATUS.PENDING) {
    throw new AppError(409, 'stop_not_pending', `This stop is already ${stop.status}`);
  }
  return { run, stop };
}

/**
 * Start a planned run: the orders go out for delivery. Orders the customer cancelled in
 * the meantime are skipped. A rider can only have one run in progress (the database
 * enforces it).
 */
export async function startRun({ rider, code, now = new Date() }) {
  let run;
  try {
    run = await Run.findOneAndUpdate(
      { code, rider: rider._id, status: RUN_STATUS.PLANNED },
      { $set: { status: RUN_STATUS.IN_PROGRESS, startedAt: now } },
      { returnDocument: 'after' },
    );
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError(409, 'run_in_progress', 'Finish your current run first');
    }
    throw err;
  }
  if (!run) {
    const existing = await Run.findOne({ code, rider: rider._id });
    if (!existing) throw new AppError(404, 'run_not_found', 'Run not found');
    throw new AppError(
      409,
      'run_not_startable',
      `This run is already ${existing.status.replaceAll('_', ' ')}`,
    );
  }

  for (const stop of run.stops) {
    const moved = await Order.updateOne(
      { code: stop.orderCode, runCode: code, status: 'placed' },
      {
        $set: { status: 'out_for_delivery' },
        $push: { statusHistory: { status: 'out_for_delivery', at: now } },
      },
    );
    if (moved.modifiedCount !== 1) {
      await Run.updateOne(
        { code, 'stops.orderCode': stop.orderCode },
        { $set: { 'stops.$.status': STOP_STATUS.SKIPPED } },
      );
    }
  }
  await finishIfDone(code, now);
  const started = await Run.findOne({ code });
  for (const stop of started.stops) {
    if (stop.status === STOP_STATUS.PENDING) await announceOrderUpdated(stop.orderCode);
  }
  await announceRun(started);
  return started;
}

async function completeDelivery({ code, orderCode, order, now }) {
  await Run.updateOne(
    { code, stops: { $elemMatch: { orderCode, status: STOP_STATUS.PENDING } } },
    { $set: { 'stops.$.status': STOP_STATUS.DELIVERED, 'stops.$.deliveredAt': now } },
  );
  // Safe to repeat: a retry after a crash finishes whatever was left undone.
  if (order.paymentMethod === 'cod') await settleCashPayment({ orderCode, now });
  await finishIfDone(code, now);
  const run = await Run.findOne({ code });
  await announceOrderUpdated(orderCode);
  await announceRun(run);
  return run;
}

/**
 * Deliver a stop by entering the customer's 6-digit code. Every attempt is counted in one
 * atomic step before it is checked, so parallel guessing cannot get extra tries. After
 * MAX_OTP_ATTEMPTS wrong codes the stop is locked and the rider must mark it failed.
 */
export async function deliverStop({ rider, code, orderCode, otp, otpSecret, now = new Date() }) {
  await loadStop({ rider, code, orderCode });

  // Delivered a moment ago but the stop was not updated yet (a crash): just finish up.
  const current = await Order.findOne({ code: orderCode, runCode: code });
  if (current?.status === 'delivered') {
    return completeDelivery({ code, orderCode, order: current, now });
  }

  const order = await Order.findOneAndUpdate(
    {
      code: orderCode,
      runCode: code,
      status: 'out_for_delivery',
      otpAttempts: { $lt: MAX_OTP_ATTEMPTS },
    },
    { $inc: { otpAttempts: 1 } },
    { returnDocument: 'after' },
  ).select('+otpSalt');

  if (!order) {
    if (current?.status === 'out_for_delivery') {
      throw new AppError(429, 'otp_locked', 'Too many wrong codes. Mark this stop as failed.');
    }
    throw new AppError(409, 'order_not_deliverable', 'This order is not out for delivery');
  }
  if (!verifyOtp(otpSecret, order.code, order.otpSalt, otp)) {
    throw new AppError(400, 'invalid_otp', 'Incorrect delivery code', {
      attemptsLeft: MAX_OTP_ATTEMPTS - order.otpAttempts,
    });
  }

  const delivered = await Order.findOneAndUpdate(
    { code: orderCode, runCode: code, status: 'out_for_delivery' },
    {
      $set: { status: 'delivered', deliveredAt: now },
      $push: { statusHistory: { status: 'delivered', at: now } },
    },
    { returnDocument: 'after' },
  );
  if (!delivered)
    throw new AppError(409, 'order_not_deliverable', 'This order is not out for delivery');
  return completeDelivery({ code, orderCode, order: delivered, now });
}

/**
 * Mark a stop as not delivered (customer away, wrong address...). The order goes back to
 * the waiting pool with its stock still reserved, and the next dispatch picks it up.
 */
export async function failStop({ rider, code, orderCode, reason, now = new Date() }) {
  await loadStop({ rider, code, orderCode });

  // Whoever changes the order first wins: a delivery that just completed cannot be failed.
  const returned = await Order.updateOne(
    { code: orderCode, runCode: code, status: 'out_for_delivery' },
    {
      $set: { status: 'placed', runCode: null, otpAttempts: 0 },
      $push: { statusHistory: { status: 'placed', at: now } },
    },
  );
  if (returned.modifiedCount !== 1) {
    throw new AppError(409, 'order_not_deliverable', 'This order is not out for delivery');
  }
  await Run.updateOne(
    { code, stops: { $elemMatch: { orderCode, status: STOP_STATUS.PENDING } } },
    { $set: { 'stops.$.status': STOP_STATUS.FAILED, 'stops.$.failReason': reason } },
  );
  await finishIfDone(code, now);
  const run = await Run.findOne({ code });
  await announceOrderUpdated(orderCode);
  await announceRun(run);
  return run;
}
