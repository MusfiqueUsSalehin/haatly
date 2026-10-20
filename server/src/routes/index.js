import { Router } from 'express';
import { healthRouter } from './health.js';
import { createAuthRouter } from './auth.js';
import { createAdminRouter } from './admin.js';
import { createCatalogRouter } from './catalog.js';
import { createAiRouter } from './ai.js';
import { createPricingRouter } from './pricing.js';

export function createApiRouter({ env, tokens, ai }) {
  const router = Router();

  router.use('/health', healthRouter);
  router.use('/auth', createAuthRouter({ env, tokens }));
  router.use('/catalog', createCatalogRouter());
  router.use('/admin', createAdminRouter({ tokens }));
  router.use('/ai', createAiRouter({ tokens, ai }));
  router.use('/pricing', createPricingRouter());

  return router;
}
