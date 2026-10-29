// Expires unpaid wallet orders and retries failed refunds: npm run payments:maintain
import { parseEnv } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { runPaymentMaintenance } from '../services/payments/maintenance.js';
import { createPaymentProvider } from '../services/payments/index.js';

const env = parseEnv(process.env);
const logger = createLogger({ ...env, LOG_LEVEL: 'silent' });

await connectDb(env.MONGODB_URI, logger);
try {
  const result = await runPaymentMaintenance({ provider: createPaymentProvider(env), logger });
  console.log(
    `Expired ${result.expired} unpaid orders, refunded ${result.refunded} of ${result.retried} stuck`,
  );
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
