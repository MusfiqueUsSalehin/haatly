import { createServer } from 'node:http';
import { parseEnv } from './config/env.js';
import { createLogger } from './config/logger.js';
import { connectDb, disconnectDb } from './config/db.js';
import { createApp } from './app.js';
import { createAppScheduler } from './jobs/index.js';
import { createRealtime } from './realtime/server.js';
import { createPaymentProvider } from './services/payments/index.js';

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

const payments = createPaymentProvider(env);
const scheduler = env.ENABLE_SCHEDULER ? createAppScheduler({ logger, payments }) : null;
const app = createApp({ env, logger, payments, scheduler });
const server = createServer(app);
const realtime = createRealtime({ httpServer: server, env, logger });

// The scheduled jobs run inside this process. Running several copies of the server is safe:
// each job is claimed by exactly one of them (see docs/JOBS.md).

server.listen(env.PORT, () => {
  logger.info(`api listening on http://localhost:${env.PORT}`);
  if (scheduler) {
    scheduler.start();
    logger.info({ jobs: scheduler.describe().map((job) => job.name) }, 'scheduler started');
  } else {
    logger.info('scheduler is off (ENABLE_SCHEDULER=false)');
  }
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

  // Stop starting new jobs and let a running one finish, then close everything else.
  (scheduler ? scheduler.stop() : Promise.resolve())
    .then(() => realtime.close())
    .then(async () => {
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
