import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Order } from '../models/Order.js';
import { RiderProfile } from '../models/RiderProfile.js';
import { Run } from '../models/Run.js';
import {
  deliverSchema,
  dutySchema,
  failSchema,
  riderRunsQuery,
  runParams,
  stopParams,
} from '../schemas/dispatch.js';
import { describeRun } from '../services/dispatch/describeRun.js';
import { deliverStop, failStop, startRun } from '../services/dispatch/riderRuns.js';
import { AppError } from '../utils/AppError.js';

const ORDER_FIELDS = 'code status recipientName phone address paymentMethod paymentStatus totalBdt';

async function describeWithOrders(run) {
  const orders = await Order.find({ code: { $in: run.stops.map((s) => s.orderCode) } })
    .select(ORDER_FIELDS)
    .lean();
  return describeRun(run, new Map(orders.map((order) => [order.code, order])));
}

/** Rider routes. A rider only ever sees and changes their own runs. */
export function createRiderRouter({ tokens, otpSecret }) {
  const router = Router();

  router.use(authenticate(tokens), requireRole('rider'));

  router.get('/me', async (req, res) => {
    const profile = await RiderProfile.findOne({ user: req.user._id });
    if (!profile) throw new AppError(404, 'profile_missing', 'An admin has not set you up yet');
    res.json({ profile });
  });

  router.post('/duty', validate(dutySchema), async (req, res) => {
    const profile = await RiderProfile.findOneAndUpdate(
      { user: req.user._id },
      { $set: { onDuty: req.valid.body.onDuty } },
      { returnDocument: 'after' },
    );
    if (!profile) throw new AppError(404, 'profile_missing', 'An admin has not set you up yet');
    res.json({ profile });
  });

  router.get('/runs', validate(riderRunsQuery, 'query'), async (req, res) => {
    const { status, page, limit } = req.valid.query;
    const filter = { rider: req.user._id, ...(status && { status }) };
    const [runs, total] = await Promise.all([
      Run.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Run.countDocuments(filter),
    ]);
    res.json({ runs: runs.map((run) => describeRun(run)), page, limit, total });
  });

  router.get('/runs/:code', validate(runParams, 'params'), async (req, res) => {
    const run = await Run.findOne({ code: req.valid.params.code, rider: req.user._id });
    if (!run) throw new AppError(404, 'run_not_found', 'Run not found');
    res.json({ run: await describeWithOrders(run) });
  });

  router.post('/runs/:code/start', validate(runParams, 'params'), async (req, res) => {
    const run = await startRun({ rider: req.user, code: req.valid.params.code });
    res.json({ run: await describeWithOrders(run) });
  });

  router.post(
    '/runs/:code/stops/:orderCode/deliver',
    validate(stopParams, 'params'),
    validate(deliverSchema),
    async (req, res) => {
      const run = await deliverStop({
        rider: req.user,
        ...req.valid.params,
        otp: req.valid.body.otp,
        otpSecret,
      });
      res.json({ run: await describeWithOrders(run) });
    },
  );

  router.post(
    '/runs/:code/stops/:orderCode/fail',
    validate(stopParams, 'params'),
    validate(failSchema),
    async (req, res) => {
      const run = await failStop({
        rider: req.user,
        ...req.valid.params,
        reason: req.valid.body.reason,
      });
      res.json({ run: await describeWithOrders(run) });
    },
  );

  return router;
}
