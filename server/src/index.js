import { createServer } from 'node:http';
import { parseEnv } from './config/env.js';
import { createLogger } from './config/logger.js';
import { connectDb, disconnectDb } from './config/db.js';
import { createApp } from './app.js';
import { createRealtime } from './realtime/server.js';

let env;
try {
  env = parseEnv(process.env);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const logger = createLogger(env);

try {
  await connectDb(env.MONGODB_URI, logger);
} catch (err) {
  logger.fatal({ err }, 'could not connect to mongodb');
  process.exit(1);
}

const app = createApp({ env, logger });
const server = createServer(app);
const realtime = createRealtime({ httpServer: server, env, logger });

server.listen(env.PORT, () => {
  logger.info(`api listening on http://localhost:${env.PORT}`);
});

let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, 'shutting down');
  setTimeout(() => {
    logger.error('forced exit after timeout');
    process.exit(1);
  }, 10_000).unref();
  realtime.close().then(async () => {
    await disconnectDb();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled promise rejection');
  process.exit(1);
});
