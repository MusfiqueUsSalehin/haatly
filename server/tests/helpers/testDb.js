import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod;
let usingExternal = false;

/**
 * Tests that run against an existing MongoDB (TEST_MONGODB_URI) wipe collections,
 * so the database name must end in "_test". This stops you from ever pointing the
 * suite at your real development or production data.
 */
function assertSafeTestUri(uri) {
  const dbName = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^/?]+)/)?.[1];
  if (!dbName?.endsWith('_test')) {
    throw new Error(
      `TEST_MONGODB_URI must name a database ending in "_test" (got "${dbName ?? 'none'}")`,
    );
  }
}

export async function startTestDb() {
  const external = process.env.TEST_MONGODB_URI;
  if (external) {
    assertSafeTestUri(external);
    usingExternal = true;
    await mongoose.connect(external, { serverSelectionTimeoutMS: 5000 });
    return;
  }
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'haatly_test' });
}

export async function clearTestDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}

export async function stopTestDb() {
  if (usingExternal) await clearTestDb();
  await mongoose.disconnect();
  await mongod?.stop();
}
