import { Router } from 'express';
import mongoose from 'mongoose';

const DB_STATES = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const db = DB_STATES[mongoose.connection.readyState] ?? 'unknown';
  const ok = db === 'connected';
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    db,
    uptimeSeconds: Math.round(process.uptime()),
  });
});
