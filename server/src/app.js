import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { createApiRouter } from './routes/index.js';
import { createTokenService } from './services/tokenService.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

/**
 * Build the Express app. It takes its config and logger as arguments instead of
 * reading globals, so tests can create as many isolated apps as they like.
 */
export function createApp({ env, logger }) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGINS, credentials: true }));
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '100kb' }));

  const tokens = createTokenService(env);
  app.use('/api', createApiRouter({ env, tokens }));

  app.use(notFound);
  app.use(errorHandler(logger));

  return app;
}
