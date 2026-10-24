// Builds today's shelf for every city. Safe to run repeatedly: npm run shelf:build
import { parseEnv } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { buildShelf } from '../services/boxes/buildShelf.js';

const env = parseEnv(process.env);

await connectDb(env.MONGODB_URI, createLogger({ ...env, LOG_LEVEL: 'silent' }));
try {
  const result = await buildShelf();
  console.log(
    `Shelf for ${result.date}: ${result.built.length} boxes built, ${result.closed} closed`,
  );
  for (const skip of result.skippedBoxes) {
    console.log(`  skipped ${skip.cityCode} ${skip.tier}: ${skip.reason}`);
  }
  for (const skip of result.skippedLots) {
    console.log(`  lot ${skip.lotCode} left out: ${skip.reason}`);
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
