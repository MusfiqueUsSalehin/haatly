// server/src/routes/hub.js
import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Hub } from '../models/Hub.js';
import { Lot } from '../models/Lot.js';
import { Run } from '../models/Run.js';
import { riderRunsQuery } from '../schemas/dispatch.js';
import { listLotsQuery } from '../schemas/lots.js';
import { describeLot } from '../services/lots/describeLot.js';
import { AppError } from '../utils/AppError.js';

/** A hub manager sees their own hub only. */
export function createHubRouter({ tokens }) {
  const router = Router();
  router.use(authenticate(tokens), requireRole('hub_manager'));

  router.use(async (req, _res, next) => {
    const hub = await Hub.findOne({ code: req.user.hubCode, active: true });
    if (!hub) throw new AppError(404, 'hub_not_found', 'Your hub is not available');
    req.hub = hub;
    next();
  });

  router.get('/me', (req, res) => res.json({ hub: req.hub.toJSON() }));

  // Produce dropped at this hub. A depot receives none, so its list is empty.
  router.get('/lots', validate(listLotsQuery, 'query'), async (req, res) => {
    const { status, page, limit } = req.valid.query;
    const filter = { hubCode: req.hub.code, ...(status && { status }) };
    const now = new Date();
    const [lots, total] = await Promise.all([
      Lot.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Lot.countDocuments(filter),
    ]);
    res.json({ lots: lots.map((lot) => describeLot(lot, now)), page, limit, total });
  });

  // Runs leaving this depot's city. A collection hub has no runs.
  router.get('/runs', validate(riderRunsQuery, 'query'), async (req, res) => {
    const { status, page, limit } = req.valid.query;
    if (req.hub.kind !== 'depot') return res.json({ runs: [], page, limit, total: 0 });
    const filter = { cityCode: req.hub.cityCode, ...(status && { status }) };
    const [runs, total] = await Promise.all([
      Run.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Run.countDocuments(filter),
    ]);
    res.json({ runs, page, limit, total });
  });

  return router;
}
