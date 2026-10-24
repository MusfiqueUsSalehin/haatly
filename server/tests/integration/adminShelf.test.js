import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeLot } from '../helpers/lotFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { Box } from '../../src/models/Box.js';
import { City } from '../../src/models/City.js';
import { Hub } from '../../src/models/Hub.js';
import { Lot } from '../../src/models/Lot.js';
import { Produce } from '../../src/models/Produce.js';
import { User } from '../../src/models/User.js';
import { seedCatalog } from '../../src/seed/catalog.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { createUser } from '../../src/services/userService.js';

const app = makeTestApp();
const tokens = createTokenService(makeTestEnv());
const farmer = new mongoose.Types.ObjectId();
const SIX = [
  ['AAAAAAAA', 'tomato'],
  ['BBBBBBBB', 'potato'],
  ['CCCCCCCC', 'okra'],
  ['DDDDDDDD', 'cabbage'],
  ['EEEEEEEE', 'spinach'],
  ['FFFFFFFF', 'carrot'],
];

let adminToken;
let customerToken;
const rebuild = (token) =>
  request(app).post('/api/admin/shelf/rebuild').set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  await startTestDb();
  await User.init();
  const person = (n, role) => ({
    name: `Person ${n}`,
    email: `person${n}@example.com`,
    phone: '+8801712345678',
    password: 'a-strong-password',
    role,
    status: 'active',
  });
  adminToken = tokens.sign(await createUser(person(1, 'admin')));
  customerToken = tokens.sign(await createUser(person(2, 'customer')));
});
afterAll(stopTestDb);
beforeEach(async () => {
  await Promise.all([
    Lot.deleteMany({}),
    Box.deleteMany({}),
    Hub.deleteMany({}),
    Produce.deleteMany({}),
    City.deleteMany({}),
  ]);
  await seedCatalog();
  await Promise.all(
    SIX.map(([suffix, produceSlug]) =>
      makeLot({ farmer, hubCode: 'savar', produceSlug, code: `LOT-${suffix}` }),
    ),
  );
});

describe('POST /api/admin/shelf/rebuild', () => {
  it('is for admins only', async () => {
    expect((await request(app).post('/api/admin/shelf/rebuild')).status).toBe(401);
    expect((await rebuild(customerToken)).status).toBe(403);
    expect(await Box.countDocuments()).toBe(0);
  });

  it("builds today's shelf and reports what it did", async () => {
    const res = await rebuild(adminToken);
    expect(res.status).toBe(200);
    expect(res.body.result.built).toHaveLength(3);
    expect(res.body.result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await Box.countDocuments({ status: 'live' })).toBe(3);
  });

  it('is safe to press twice', async () => {
    await rebuild(adminToken);
    const again = await rebuild(adminToken);
    expect(again.status).toBe(200);
    expect(again.body.result.closed).toBe(0);
    expect(await Box.countDocuments()).toBe(3);
  });
});
