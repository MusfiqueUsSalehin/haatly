import { Router } from 'express';
import { healthRouter } from './health.js';
import { createAuthRouter } from './auth.js';

export function createApiRouter({ env, tokens }) {
  const router = Router();

  router.use('/health', healthRouter);
  router.use('/auth', createAuthRouter({ env, tokens }));

  return router;
}
