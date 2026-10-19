import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Produce } from '../models/Produce.js';
import { triageSchema } from '../schemas/ai.js';
import { buildTriageRequest } from '../services/ai/triage.js';
import { AppError } from '../utils/AppError.js';

export function createAiRouter({ tokens, ai, perUserPerHour = 30 }) {
  const router = Router();

  router.use(authenticate(tokens), requireRole('farmer'));

  // Each grading may cost money, so each farmer gets a fair hourly allowance.
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: perUserPerHour,
    keyGenerator: (req) => String(req.user._id),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError(429, 'rate_limited', 'Too many gradings this hour. Please try later.')),
  });

  // The photo is graded and discarded: it is never written to disk or the database.
  router.post('/triage', limiter, validate(triageSchema), async (req, res) => {
    const { produceSlug, defectTags, photo } = req.valid.body;
    const produce = await Produce.findOne({ slug: produceSlug, active: true });
    if (!produce) throw new AppError(404, 'produce_not_found', 'Produce item not found');

    const { result, source, fallbackReason } = await ai.run(
      buildTriageRequest({ produce, defectTags, photo }),
    );
    res.json({ triage: result, source, ...(fallbackReason && { fallbackReason }) });
  });

  return router;
}
