import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dispatchAndDeliverAll, makeUser, placeOrderFor } from '../helpers/deliveryFixture.js';
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

let today;
let f1;
let f2;
let customer;
let rider;
let admin;

const as = (user) => ({ Authorization: `Bearer ${tokens.sign(user)}` });
const owed = (user = admin) => request(app).get('/api/admin/earnings').set(as(user));
const payout = (farmerId, payoutRef, user = admin) =>
  request(app).post(`/api/admin/earnings/${farmerId}/payout`).set(as(user)).send({ payoutRef });
const summaryOf = async (farmer) => {
  const res = await request(app).get('/api/earnings').set(as(farmer));
  return res.body.summary;
};

beforeAll(async () => {
  await startTestDb();
  await Promise.all([User.init(), Run.init(), RiderProfile.init(), LedgerEntry.init()]);
  f1 = await makeUser(1, 'farmer');
  f2 = await makeUser(2, 'farmer');
  customer = await makeUser(3, 'customer');
  rider = await makeUser(4, 'rider');
  admin = await makeUser(5, 'admin');
});
afterAll(stopTestDb);
beforeEach(async () => {
  ({ today } = await setUpDeliveredOrders({
    tomatoFarmer: f1,
    cabbageFarmer: f2,
    customer,
    rider,
    otpSecret: env.JWT_SECRET,
  }));
});

describe('admin earnings: access', () => {
  it('is for admins only', async () => {
    expect((await request(app).get('/api/admin/earnings')).status).toBe(401);
    for (const user of [customer, f1, rider]) {
      expect((await owed(user)).status).toBe(403);
      expect((await payout(f1._id, 'BKASH-1', user)).status).toBe(403);
    }
    expect(await LedgerEntry.countDocuments({ status: 'paid' })).toBe(0);
  });
});

describe('GET /api/admin/earnings', () => {
  it('lists who is owed money', async () => {
    const res = await owed();
    expect(res.status).toBe(200);
    expect(res.body.farmers.map((f) => [f.name, f.unpaidBdt, f.entries])).toEqual([
      ['Person 1', 241.92, 2],
      ['Person 2', 241.92, 2],
    ]);
    expect(res.body.farmers[0]).toMatchObject({
      farmerId: String(f1._id),
      phone: '+8801712345678',
    });
    expect(res.body.farmers[0].oldestDeliveredAt).toBeTypeOf('string');
  });

  it('leaves out farmers who have been paid', async () => {
    await payout(f1._id, 'BKASH-1');
    const res = await owed();
    expect(res.body.farmers.map((f) => f.name)).toEqual(['Person 2']);
  });
});

describe('POST /api/admin/earnings/:id/payout', () => {
  it('pays everything the farmer is owed and records the reference', async () => {
    const res = await payout(f1._id, 'BKASH-TX123');
    expect(res.status).toBe(200);
    expect(res.body.payout).toEqual({ payoutRef: 'BKASH-TX123', paidEntries: 2, paidBdt: 241.92 });

    expect(await summaryOf(f1)).toMatchObject({ unpaidBdt: 0, paidBdt: 241.92 });
    const entries = await LedgerEntry.find({ farmer: f1._id });
    expect(entries.every((e) => e.status === 'paid' && e.payoutRef === 'BKASH-TX123')).toBe(true);
    expect(entries.every((e) => e.paidAt instanceof Date)).toBe(true);
  });

  it('leaves every other farmer alone', async () => {
    await payout(f1._id, 'BKASH-1');
    expect(await summaryOf(f2)).toMatchObject({ unpaidBdt: 241.92, paidBdt: 0 });
  });

  it('refuses a second payout when nothing is unpaid', async () => {
    await payout(f1._id, 'BKASH-1');
    const again = await payout(f1._id, 'BKASH-2');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('nothing_to_pay');
    const entries = await LedgerEntry.find({ farmer: f1._id });
    expect(entries.every((e) => e.payoutRef === 'BKASH-1')).toBe(true);
  });

  it('pays later earnings in a separate payout', async () => {
    await payout(f1._id, 'BKASH-1');
    await placeOrderFor(customer, today, { zoneCode: 'dhaka-mirpur' });
    await dispatchAndDeliverAll({ rider, otpSecret: env.JWT_SECRET });

    expect(await summaryOf(f1)).toMatchObject({ unpaidBdt: 120.96, paidBdt: 241.92 });
    const res = await payout(f1._id, 'BKASH-2');
    expect(res.body.payout).toEqual({ payoutRef: 'BKASH-2', paidEntries: 1, paidBdt: 120.96 });
  });

  it('never pays an entry twice when two payouts run at the same time', async () => {
    const results = await Promise.all([payout(f1._id, 'REF-AAA'), payout(f1._id, 'REF-BBB')]);

    for (const result of results) expect([200, 409]).toContain(result.status);
    const succeeded = results.filter((result) => result.status === 200);
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
    expect(succeeded.reduce((sum, r) => sum + r.body.payout.paidEntries, 0)).toBe(2);
    expect(await LedgerEntry.countDocuments({ farmer: f1._id, status: 'unpaid' })).toBe(0);
    expect(await LedgerEntry.countDocuments({ farmer: f1._id, status: 'paid' })).toBe(2);
  });

  it('rejects a bad reference, a bad id, an unknown farmer and a non-farmer', async () => {
    for (const ref of [undefined, '', 'ab', 'x'.repeat(81)]) {
      const res = await payout(f1._id, ref);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    }
    expect((await payout('not-an-id', 'BKASH-1')).status).toBe(400);
    expect((await payout('65f1c2a4b9d3e8a1c4f7b001', 'BKASH-1')).status).toBe(404);
    const notFarmer = await payout(customer._id, 'BKASH-1');
    expect(notFarmer.status).toBe(404);
    expect(notFarmer.body.error.code).toBe('farmer_not_found');
    expect(await LedgerEntry.countDocuments({ status: 'paid' })).toBe(0);
  });
});
