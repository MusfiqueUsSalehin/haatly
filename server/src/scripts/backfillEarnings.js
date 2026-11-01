// Records earnings for delivered orders that missed it: npm run earnings:backfill
import { parseEnv } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { backfillEarnings } from '../services/earnings/recordEarnings.js';

const env = parseEnv(process.env);

await connectDb(env.MONGODB_URI, createLogger({ ...env, LOG_LEVEL: 'silent' }));
try {
  const result = await backfillEarnings();
  console.log(`Checked ${result.checked} delivered orders, recorded ${result.recorded} entries`);
  for (const item of result.failed) console.log(`  ${item.orderCode}: ${item.error}`);
  if (result.failed.length > 0) process.exitCode = 1;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
