import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Lot } from '../models/Lot.js';
import { createLotSchema, listLotsQuery, lotCodeParams } from '../schemas/lots.js';
import { createLot } from '../services/lots/createLot.js';
import { describeLot } from '../services/lots/describeLot.js';
import { AppError } from '../utils/AppError.js';

/** Farmer routes for managing their own lots. */
export function createLotsRouter({ tokens, ai, perUserPerHour = 60 }) {
  const router = Router();

  router.use(authenticate(tokens), requireRole('farmer'));

  // Listing can trigger a paid grading call, so each farmer gets an hourly allowance.
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: perUserPerHour,
    keyGenerator: (req) => String(req.user._id),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError(429, 'rate_limited', 'Too many lots listed this hour. Please try later.')),
  });

  router.post('/', limiter, validate(createLotSchema), async (req, res) => {
    const { lot, quote, triage } = await createLot({
      farmer: req.user,
      body: req.valid.body,
      ai,
    });
    res.status(201).json({ lot, quote, triage });
  });

  // A lot past its expiry still shows as "listed" until the expiry sweep runs.
  router.get('/', validate(listLotsQuery, 'query'), async (req, res) => {
    const { status, page, limit } = req.valid.query;
    const filter = { farmer: req.user._id, ...(status && { status }) };
    const [lots, total] = await Promise.all([
      Lot.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Lot.countDocuments(filter),
    ]);
    const now = new Date();
    res.json({ lots: lots.map((lot) => describeLot(lot, now)), page, limit, total });
  });

  // Someone else's lot looks exactly like a lot that does not exist.
  router.get('/:code', validate(lotCodeParams, 'params'), async (req, res) => {
    const lot = await Lot.findOne({ code: req.valid.params.code, farmer: req.user._id });
    if (!lot) throw new AppError(404, 'lot_not_found', 'Lot not found');
    res.json({ lot: describeLot(lot) });
  });

  return router;
}
