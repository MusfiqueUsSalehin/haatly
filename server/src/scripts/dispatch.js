// Groups waiting orders into rider runs in every active city: npm run dispatch:run
import { parseEnv } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { City } from '../models/City.js';
import { dispatchCity } from '../services/dispatch/dispatchCity.js';

const env = parseEnv(process.env);

await connectDb(env.MONGODB_URI, createLogger({ ...env, LOG_LEVEL: 'silent' }));
try {
  const cities = await City.find({ active: true }).select('code').lean();
  for (const { code } of cities) {
    const { runs, unassigned } = await dispatchCity({ cityCode: code });
    const stops = runs.reduce((sum, run) => sum + run.stops.length, 0);
    console.log(`${code}: ${runs.length} runs, ${stops} stops, ${unassigned.length} unassigned`);
    for (const item of unassigned) console.log(`  ${item.orderCode}: ${item.reason}`);
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
