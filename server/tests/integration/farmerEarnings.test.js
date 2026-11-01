import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeUser } from '../helpers/deliveryFixture.js';
import { setUpDeliveredOrders } from '../helpers/earningsFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { LedgerEntry } from '../../src/models/LedgerEntry.js';
import { RiderProfile } from '../../src/models/RiderProfile.js';
import { Run } from '../../src/models/Run.js';
import { User } from '../../src/models/User.js';
import { createTokenService } from '../../src/services/tokenService.js';

const env = makeTestEnv();
const tokens = createTokenService(env);
const app = makeTestApp();
const zeros = { kg: 0, farmerBdt: 0, unpaidBdt: 0, paidBdt: 0, orders: 0, entries: 0 };

let f1;
let f2;
let f3;
let pending;
let customer;
let rider;
let admin;

const get = (path, user) =>
  request(app)
    .get(`/api/earnings${path}`)
    .set('Authorization', `Bearer ${tokens.sign(user)}`);

beforeAll(async () => {
  await startTestDb();
  await Promise.all([User.init(), Run.init(), RiderProfile.init(), LedgerEntry.init()]);
  f1 = await makeUser(1, 'farmer');
  f2 = await makeUser(2, 'farmer');
  f3 = await makeUser(3, 'farmer');
  pending = await makeUser(4, 'farmer', 'pending');
  customer = await makeUser(5, 'customer');
  rider = await makeUser(6, 'rider');
  admin = await makeUser(7, 'admin');
});
afterAll(stopTestDb);
beforeEach(async () => {
  await setUpDeliveredOrders({
    tomatoFarmer: f1,
    cabbageFarmer: f2,
    customer,
    rider,
    otpSecret: env.JWT_SECRET,
  });
});

describe('farmer earnings: access', () => {
  it('is for approved farmers only', async () => {
    expect((await request(app).get('/api/earnings')).status).toBe(401);
    expect((await get('', customer)).status).toBe(403);
    expect((await get('', admin)).status).toBe(403);
    const unapproved = await get('', pending);
    expect(unapproved.status).toBe(403);
    expect(unapproved.body.error.code).toBe('account_pending');
  });
});

describe('GET /api/earnings', () => {
  it('summarises what the farmer has earned, without the platform margin', async () => {
    const res = await get('', f1);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      summary: { kg: 6, farmerBdt: 241.92, unpaidBdt: 241.92, paidBdt: 0, orders: 2, entries: 2 },
    });
  });

  it('shows a farmer with no sales zeros', async () => {
    expect((await get('', f3)).body.summary).toEqual(zeros);
  });

  it('splits paid from unpaid', async () => {
    await LedgerEntry.updateMany(
      { farmer: f1._id },
      { status: 'paid', paidAt: new Date(), payoutRef: 'BKASH-1' },
    );
    expect((await get('', f1)).body.summary).toMatchObject({
      farmerBdt: 241.92,
      unpaidBdt: 0,
      paidBdt: 241.92,
    });
  });
});

describe('GET /api/earnings/entries', () => {
  it("lists the farmer's own entries, with exactly the fields they should see", async () => {
    const res = await get('/entries', f1);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.entries.every((e) => e.lotCode === 'LOT-AAAAAAAA')).toBe(true);

    const [entry] = res.body.entries;
    expect(Object.keys(entry).sort()).toEqual([
      'deliveredAt',
      'farmerBdt',
      'floorBdt',
      'kg',
      'lotCode',
      'orderCode',
      'pricePerKgBdt',
      'produceSlug',
      'status',
    ]);
    expect(entry).toMatchObject({
      produceSlug: 'tomato',
      kg: 3,
      pricePerKgBdt: 56,
      floorBdt: 28,
      farmerBdt: 120.96,
      status: 'unpaid',
    });
  });

  it("never shows another farmer's entries", async () => {
    const res = await get('/entries', f2);
    expect(res.body.entries.every((e) => e.lotCode === 'LOT-DDDDDDDD')).toBe(true);
    expect((await get('/entries', f3)).body).toMatchObject({ total: 0, entries: [] });
  });

  it('shows when and how paid entries were paid', async () => {
    await LedgerEntry.updateMany(
      { farmer: f1._id },
      { status: 'paid', paidAt: new Date(), payoutRef: 'BKASH-1' },
    );
    const res = await get('/entries?status=paid', f1);
    expect(res.body.total).toBe(2);
    expect(res.body.entries[0]).toMatchObject({ status: 'paid', payoutRef: 'BKASH-1' });
    expect(res.body.entries[0].paidAt).toBeTypeOf('string');
  });

  it('filters by status and paginates', async () => {
    expect((await get('/entries?status=paid', f1)).body.total).toBe(0);
    expect((await get('/entries?status=unpaid', f1)).body.total).toBe(2);

    const page = (await get('/entries?limit=1&page=2', f1)).body;
    expect(page).toMatchObject({ page: 2, limit: 1, total: 2 });
    expect(page.entries).toHaveLength(1);

    expect((await get('/entries?status=lost', f1)).status).toBe(400);
  });
});
