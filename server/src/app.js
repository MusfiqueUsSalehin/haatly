import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { createApiRouter } from './routes/index.js';
import { createAiGatewayFromEnv } from './services/ai/index.js';
import { createTokenService } from './services/tokenService.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

/**
 * Build the Express app. It takes its config and logger as arguments instead of
 * reading globals, so tests can create as many isolated apps as they like.
 * Tests may also pass their own `ai` gateway.
 */
export function createApp({ env, logger, ai = createAiGatewayFromEnv({ env, logger }) }) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGINS, credentials: true }));
  app.use(pinoHttp({ logger }));

  // Crate photos arrive as base64, so the AI routes get a larger body limit. This parser
  // must come first: it reads those bodies, and the strict global one below then skips them.
  app.use(['/api/ai', '/api/lots'], express.json({ limit: '2mb' }));
  app.use(express.json({ limit: '100kb' }));

  const tokens = createTokenService(env);
  app.use('/api', createApiRouter({ env, tokens, ai }));

  app.use(notFound);
  app.use(errorHandler(logger));

  return app;
}
