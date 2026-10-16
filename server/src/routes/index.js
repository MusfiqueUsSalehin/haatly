import { Router } from 'express';
import { healthRouter } from './health.js';
import { createAuthRouter } from './auth.js';
import { createAdminRouter } from './admin.js';

export function createApiRouter({ env, tokens }) {
  const router = Router();

  router.use('/health', healthRouter);
  router.use('/auth', createAuthRouter({ env, tokens }));
  router.use('/admin', createAdminRouter({ tokens }));

  return router;
}
