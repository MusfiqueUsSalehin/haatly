import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { recipesSchema } from '../schemas/recipes.js';
import { suggestRecipes } from '../services/recipes/suggest.js';
import { AppError } from '../utils/AppError.js';

/** Recipe ideas for customers. Signed in, rate limited, and never fed client text. */
export function createRecipesRouter({ tokens, ai, perUserPerHour = 20 }) {
  const router = Router();

  router.use(authenticate(tokens), requireRole('customer'));

  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: perUserPerHour,
    keyGenerator: (req) => String(req.user._id),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(
        new AppError(429, 'rate_limited', 'Too many recipe requests this hour. Please try later.'),
      ),
  });

  router.post('/', limiter, validate(recipesSchema), async (req, res) => {
    const { produceSlugs, language } = req.valid.body;
    res.json(await suggestRecipes({ slugs: produceSlugs, language, ai }));
  });

  return router;
}
