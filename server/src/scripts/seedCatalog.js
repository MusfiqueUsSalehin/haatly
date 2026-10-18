// Loads cities, zones, hubs and produce. Safe to run repeatedly: npm run seed:catalog
import { parseEnv } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { seedCatalog } from '../seed/catalog.js';

const env = parseEnv(process.env);

await connectDb(env.MONGODB_URI, createLogger({ ...env, LOG_LEVEL: 'silent' }));
try {
  const result = await seedCatalog();
  for (const [name, { inserted, existing }] of Object.entries(result)) {
    console.log(`${name.padEnd(8)} ${inserted} added, ${existing} already there`);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
