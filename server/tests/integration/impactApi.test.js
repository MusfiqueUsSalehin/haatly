import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeUser, placeOrderFor } from '../helpers/deliveryFixture.js';
import { setUpDeliveredOrders } from '../helpers/earningsFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { LedgerEntry } from '../../src/models/LedgerEntry.js';
import { Order } from '../../src/models/Order.js';
import { RiderProfile } from '../../src/models/RiderProfile.js';
import { Run } from '../../src/models/Run.js';
import { User } from '../../src/models/User.js';
import { createImpactRouter } from '../../src/routes/impact.js';
import { createTokenService } from '../../src/services/tokenService.js';

const env = makeTestEnv();
const tokens = createTokenService(env);

const appWith = (options = {}) => {
  const mini = express();
  mini.use('/impact', createImpactRouter({ tokens, cacheMs: 0, ...options }));
  mini.use(errorHandler({ error() {} }));
  return mini;
};
const me = (app, user) =>
  request(app)
    .get('/impact/me')
    .set('Authorization', `Bearer ${tokens.sign(user)}`);

let today;
let o2;
let f1;
let f2;
let customer;
let other;
let rider;

beforeAll(async () => {
  await startTestDb();
  await Promise.all([User.init(), Run.init(), RiderProfile.init(), LedgerEntry.init()]);
  f1 = await makeUser(1, 'farmer');
  f2 = await makeUser(2, 'farmer');
  customer = await makeUser(3, 'customer');
  other = await makeUser(4, 'customer');
  rider = await makeUser(5, 'rider');
});
afterAll(stopTestDb);
beforeEach(async () => {
  ({ today, o2 } = await setUpDeliveredOrders({
    tomatoFarmer: f1,
    cabbageFarmer: f2,
    customer,
    rider,
    otpSecret: env.JWT_SECRET,
  }));
});

describe('GET /impact/me', () => {
  it('needs a signed-in customer', async () => {
    const app = appWith();
    expect((await request(app).get('/impact/me')).status).toBe(401);
    expect((await me(app, f1)).status).toBe(403);
  });

  it("adds up the customer's delivered orders, with the assumptions behind CO2e", async () => {
    const res = await me(appWith(), customer);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      impact: { kgRescued: 12, bazarValueBdt: 840, paidBdt: 672, savedBdt: 168, co2eKg: 4.2 },
      orders: 2,
      assumptions: { co2eKgPerKgProduce: 0.5, wasteShare: 0.7 },
    });
  });

  it('shows a customer with no deliveries zeros', async () => {
    const res = await me(appWith(), other);
    expect(res.body.orders).toBe(0);
    expect(res.body.impact).toEqual({
      kgRescued: 0,
      bazarValueBdt: 0,
      paidBdt: 0,
      savedBdt: 0,
      co2eKg: 0,
    });
  });

  it('only counts orders that were delivered', async () => {
    await placeOrderFor(customer, today);
    expect((await me(appWith(), customer)).body.orders).toBe(2);
  });
});

describe('GET /impact (public)', () => {
  const expected = {
    ordersDelivered: 2,
    kgRescued: 12,
    savedBdt: 168,
    co2eKg: 4.2,
    farmerEarningsBdt: 483.84,
    farmersEarning: 2,
  };

  it('needs no login and holds numbers only', async () => {
    const res = await request(appWith()).get('/impact');
    expect(res.status).toBe(200);
    expect(res.body.impact).toEqual(expected);
    expect(res.body.assumptions).toEqual({ co2eKgPerKgProduce: 0.5, wasteShare: 0.7 });
    expect(res.body.asOf).toBeTypeOf('string');
    expect(JSON.stringify(res.body)).not.toMatch(/Person|@|8801|Mirpur/);
  });

  it('is reachable in the full app too', async () => {
    const res = await request(makeTestApp()).get('/api/impact');
    expect(res.status).toBe(200);
    expect(res.body.impact.ordersDelivered).toBe(2);
  });

  it('shows zeros when nothing has been delivered', async () => {
    await Promise.all([Order.deleteMany({}), LedgerEntry.deleteMany({})]);
    const res = await request(appWith()).get('/impact');
    expect(res.body.impact).toEqual({
      ordersDelivered: 0,
      kgRescued: 0,
      savedBdt: 0,
      co2eKg: 0,
      farmerEarningsBdt: 0,
      farmersEarning: 0,
    });
  });

  it('serves a cached figure until the cache expires', async () => {
    let clock = 1_000_000;
    const app = appWith({ cacheMs: 60_000, now: () => clock });

    expect((await request(app).get('/impact')).body.impact.ordersDelivered).toBe(2);
    await Order.deleteOne({ code: o2.code });
    expect((await request(app).get('/impact')).body.impact.ordersDelivered).toBe(2);

    clock += 61_000;
    const fresh = await request(app).get('/impact');
    expect(fresh.body.impact).toMatchObject({ ordersDelivered: 1, kgRescued: 6 });
  });
});
