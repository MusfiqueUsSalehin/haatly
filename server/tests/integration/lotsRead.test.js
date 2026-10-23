import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeLot } from '../helpers/lotFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { Lot } from '../../src/models/Lot.js';
import { User } from '../../src/models/User.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { createUser } from '../../src/services/userService.js';

const app = makeTestApp();
const tokens = createTokenService(makeTestEnv());

let farmer;
let other;
let farmerToken;
let pendingToken;
let customerToken;

const get = (path, token = farmerToken) =>
  request(app).get(`/api/lots${path}`).set('Authorization', `Bearer ${token}`);

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
  farmer = await createUser(person(1, 'farmer', 'active'));
  other = await createUser(person(2, 'farmer', 'active'));
  farmerToken = tokens.sign(farmer);
  pendingToken = tokens.sign(await createUser(person(3, 'farmer', 'pending')));
  customerToken = tokens.sign(await createUser(person(4, 'customer', 'active')));
});
afterAll(stopTestDb);
beforeEach(() => Lot.deleteMany({}));

describe('lot reads: access', () => {
  it('requires a token and an approved farmer', async () => {
    expect((await request(app).get('/api/lots')).status).toBe(401);
    expect((await get('', customerToken)).status).toBe(403);
    const pending = await get('', pendingToken);
    expect(pending.status).toBe(403);
    expect(pending.body.error.code).toBe('account_pending');
  });
});

describe('GET /api/lots', () => {
  it('lists only the signed-in farmer lots, newest first', async () => {
    const first = await makeLot({ farmer: farmer._id });
    const second = await makeLot({ farmer: farmer._id });
    await makeLot({ farmer: other._id });

    const res = await get('');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.lots.map((l) => l.code)).toEqual([second.code, first.code]);
    expect(res.body.lots.every((l) => l.farmer === String(farmer._id))).toBe(true);
  });

  it('adds sold kilos, hours left and the farmer payout', async () => {
    await makeLot({ farmer: farmer._id, listedHoursAgo: 24, remainingKg: 60 });
    const [lot] = (await get('')).body.lots;
    expect(lot.soldKg).toBe(40);
    expect(lot.hoursToExpiry).toBeCloseTo(96, 0);
    expect(lot.farmerPayoutPerKgBdt).toBe(40.32);
    expect(lot._id).toBeUndefined();
  });

  it('filters by status and paginates', async () => {
    await makeLot({ farmer: farmer._id });
    await makeLot({ farmer: farmer._id });
    await makeLot({ farmer: farmer._id, status: 'withdrawn' });
    await makeLot({ farmer: farmer._id, status: 'sold_out', remainingKg: 0 });

    expect((await get('?status=listed')).body.total).toBe(2);
    expect((await get('?status=withdrawn')).body.total).toBe(1);

    const page2 = (await get('?limit=3&page=2')).body;
    expect(page2).toMatchObject({ page: 2, limit: 3, total: 4 });
    expect(page2.lots).toHaveLength(1);
  });

  it('rejects an unknown status', async () => {
    const res = await get('?status=lost');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });
});

describe('GET /api/lots/:code', () => {
  it('returns one of your lots', async () => {
    const lot = await makeLot({ farmer: farmer._id });
    const res = await get(`/${lot.code}`);
    expect(res.status).toBe(200);
    expect(res.body.lot).toMatchObject({ code: lot.code, soldKg: 0, farmerPayoutPerKgBdt: 40.32 });
  });

  it("treats another farmer's lot as not found", async () => {
    const theirs = await makeLot({ farmer: other._id });
    const res = await get(`/${theirs.code}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('lot_not_found');
  });

  it('returns 404 for an unknown code and 400 for a malformed one', async () => {
    expect((await get('/LOT-AAAAAAAA')).status).toBe(404);
    expect((await get('/BAD-CODE')).status).toBe(400);
  });
});
