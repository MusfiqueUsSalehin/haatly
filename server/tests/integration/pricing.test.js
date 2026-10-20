import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { Produce } from '../../src/models/Produce.js';
import { User } from '../../src/models/User.js';
import { seedCatalog } from '../../src/seed/catalog.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { createUser } from '../../src/services/userService.js';

const app = makeTestApp();
const tokens = createTokenService(makeTestEnv());
const base = { produceSlug: 'tomato', grade: 'A', shelfLifeDays: 5, hoursToExpiry: 120 };

const quote = (body, token) =>
  request(app).post('/api/pricing/quote').set('Authorization', `Bearer ${token}`).send(body);

let farmerToken;
let pendingToken;
let customerToken;

beforeAll(async () => {
  await startTestDb();
  await User.init();
  const person = (n, role, status) => ({
    name: `Person ${n}`,
    email: `person${n}@example.com`,
    phone: '+8801712345678',
    password: 'a-strong-password',
    role,
    status,
  });
  farmerToken = tokens.sign(await createUser(person(1, 'farmer', 'active')));
  pendingToken = tokens.sign(await createUser(person(2, 'farmer', 'pending')));
  customerToken = tokens.sign(await createUser(person(3, 'customer', 'active')));
});
afterAll(stopTestDb);
beforeEach(async () => {
  await Produce.deleteMany({});
  await seedCatalog();
  // No seasons, so the expected prices never depend on today's date.
  await Produce.updateMany({}, { peakMonths: [] });
});

describe('POST /api/pricing/quote: access', () => {
  it('requires a token', async () => {
    const res = await request(app).post('/api/pricing/quote').send(base);
    expect(res.status).toBe(401);
  });

  it('forbids customers and farmers who are not approved yet', async () => {
    expect((await quote(base, customerToken)).status).toBe(403);
    const pending = await quote(base, pendingToken);
    expect(pending.status).toBe(403);
    expect(pending.body.error.code).toBe('account_pending');
  });
});

describe('POST /api/pricing/quote', () => {
  it('prices a fresh lot and shows what the farmer is paid', async () => {
    const res = await quote(base, farmerToken);
    expect(res.status).toBe(200);
    expect(res.body.quote).toEqual({
      priceBdt: 56,
      discountPct: 20,
      farmerFloorBdt: 28,
      consumerFloorBdt: 39,
      farmerPayoutBdt: 40.32,
      riskScore: 0,
      atFloor: false,
    });
  });

  it('shows how the price falls as time runs out, never below the floor', async () => {
    const res = await quote(base, farmerToken);
    const prices = res.body.schedule.map((step) => step.priceBdt);
    expect(prices).toEqual([56, 50, 45, 39, 39]);
    expect(res.body.schedule.map((step) => step.hoursToExpiry)).toEqual([120, 90, 60, 30, 12]);
    for (const step of res.body.schedule) expect(step.farmerPayoutBdt).toBeGreaterThanOrEqual(28);
  });

  it('follows the bazar price an admin sets', async () => {
    await Produce.updateOne({ slug: 'tomato' }, { bazarPriceBdt: 100 });
    const res = await quote(base, farmerToken);
    expect(res.body.quote).toMatchObject({
      priceBdt: 80,
      farmerFloorBdt: 40,
      consumerFloorBdt: 56,
    });
  });

  it('sits at the floor when expiry is close', async () => {
    const res = await quote({ ...base, hoursToExpiry: 12 }, farmerToken);
    expect(res.body.quote).toMatchObject({ priceBdt: 39, atFloor: true, farmerPayoutBdt: 28.08 });
  });

  it('refuses a shelf life longer than the catalog allows', async () => {
    const res = await quote({ ...base, shelfLifeDays: 6 }, farmerToken);
    expect(res.status).toBe(400);
    expect(res.body.error.details.shelfLifeDays).toMatch(/5 days/);
  });

  it('refuses more hours left than the shelf life', async () => {
    const res = await quote({ ...base, hoursToExpiry: 121 }, farmerToken);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty('hoursToExpiry');
  });

  it.each([
    ['an unknown grade', { grade: 'Z' }],
    ['negative hours', { hoursToExpiry: -1 }],
    ['hours sent as text', { hoursToExpiry: '120' }],
    ['a fractional shelf life', { shelfLifeDays: 2.5 }],
    ['a missing produce code', { produceSlug: undefined }],
  ])('rejects %s', async (_label, change) => {
    const res = await quote({ ...base, ...change }, farmerToken);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('returns 404 for unknown and inactive produce', async () => {
    expect((await quote({ ...base, produceSlug: 'dragonfruit' }, farmerToken)).status).toBe(404);
    await Produce.updateOne({ slug: 'tomato' }, { active: false });
    expect((await quote(base, farmerToken)).status).toBe(404);
  });
});
