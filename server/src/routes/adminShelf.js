import { Router } from 'express';
import { buildShelf } from '../services/boxes/buildShelf.js';

/** Mounted under /api/admin/shelf, after the admin-only guard. */
export function createAdminShelfRouter() {
  const router = Router();

  router.post('/rebuild', async (_req, res) => {
    res.json({ result: await buildShelf() });
  });

  return router;
}
