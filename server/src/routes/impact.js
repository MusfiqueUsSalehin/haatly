import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { customerImpact, platformImpact } from '../services/impact/queries.js';
import { createTtlCache } from '../utils/ttlCache.js';

/**
 * GET /     public platform totals (cached, because they scan every delivered order)
 * GET /me   the signed-in customer's own impact
 */
export function createImpactRouter({ tokens, cacheMs = 5 * 60 * 1000, now = () => Date.now() }) {
  const router = Router();
  const cache = createTtlCache({ ttlMs: cacheMs, now });

  router.get('/', async (_req, res) => {
    res.json(await cache.get('platform', platformImpact));
  });

  router.get('/me', authenticate(tokens), requireRole('customer'), async (req, res) => {
    res.json(await customerImpact(req.user._id));
  });

  return router;
}
