import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createLotSchema } from '../schemas/lots.js';
import { createLot } from '../services/lots/createLot.js';
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

  return router;
}
