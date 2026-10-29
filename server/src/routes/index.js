import { Router } from 'express';
import { healthRouter } from './health.js';
import { createAuthRouter } from './auth.js';
import { createAdminRouter } from './admin.js';
import { createCatalogRouter } from './catalog.js';
import { createAiRouter } from './ai.js';
import { createPricingRouter } from './pricing.js';
import { createLotsRouter } from './lots.js';
import { createBoxesRouter } from './boxes.js';
import { createOrdersRouter } from './orders.js';

export function createApiRouter({ env, tokens, ai, payments }) {
  const router = Router();

  router.use('/health', healthRouter);
  router.use('/auth', createAuthRouter({ env, tokens }));
  router.use('/catalog', createCatalogRouter());
  router.use('/admin', createAdminRouter({ tokens }));
  router.use('/ai', createAiRouter({ tokens, ai }));
  router.use('/pricing', createPricingRouter({ tokens }));
  router.use('/lots', createLotsRouter({ tokens, ai }));
  router.use('/boxes', createBoxesRouter());
  router.use(
    '/orders',
    createOrdersRouter({
      tokens,
      otpSecret: env.JWT_SECRET,
      provider: payments,
      paymentWindowMinutes: env.PAYMENT_WINDOW_MINUTES,
    }),
  );

  return router;
}
