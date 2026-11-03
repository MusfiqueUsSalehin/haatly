// Runs every job that is due, once, and exits: npm run jobs:run
// Useful for an external timer (a system cron or a hosting scheduler), or for trying the jobs.
import { parseEnv } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { createPaymentProvider } from '../services/payments/index.js';
import { createAppScheduler } from './index.js';

const env = parseEnv(process.env);
const logger = createLogger({ ...env, LOG_LEVEL: 'silent' });

await connectDb(env.MONGODB_URI, logger);
try {
  const scheduler = createAppScheduler({ logger, payments: createPaymentProvider(env) });
  for (const result of await scheduler.runDue()) {
    const detail = result.error ?? (result.summary ? JSON.stringify(result.summary) : '');
    console.log(`${result.name.padEnd(18)} ${result.outcome} ${detail}`.trimEnd());
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
