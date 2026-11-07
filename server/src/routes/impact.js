import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { customerImpact, platformImpact } from '../services/impact/queries.js';
import { fillNarrative, narrationWording } from '../services/ai/impactNarrative.js';
import { createTtlCache } from '../utils/ttlCache.js';

/**
 * GET /            public platform totals (cached, because they scan every delivered order)
 * GET /me          the signed-in customer's own impact
 * GET /me/summary  a short thank-you with their numbers (AI wording, cached across users)
 */
export function createImpactRouter({
  tokens,
  ai,
  cacheMs = 5 * 60 * 1000,
  wordingCacheMs = 6 * 60 * 60 * 1000,
  now = () => Date.now(),
}) {
  const router = Router();
  const cache = createTtlCache({ ttlMs: cacheMs, now });
  const wordingCache = createTtlCache({ ttlMs: wordingCacheMs, now });

  router.get('/', async (_req, res) => {
    res.json(await cache.get('platform', platformImpact));
  });

  router.get('/me', authenticate(tokens), requireRole('customer'), async (req, res) => {
    res.json(await customerImpact(req.user._id));
  });

  router.get('/me/summary', authenticate(tokens), requireRole('customer'), async (req, res) => {
    const mine = await customerImpact(req.user._id);
    if (!mine.orders) return res.json({ summary: null });
    const { texts, source } = await wordingCache.get('wording', () => narrationWording(ai));
    const figures = {
      orders: mine.orders,
      kg: mine.impact.kgRescued,
      co2: mine.impact.co2eKg,
      saved: mine.impact.savedBdt,
    };
    res.json({ summary: fillNarrative(texts, figures), source });
  });

  return router;
}
