import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeUser, placeOrderFor } from '../helpers/deliveryFixture.js';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { Order } from '../../src/models/Order.js';
import { Produce } from '../../src/models/Produce.js';
import { User } from '../../src/models/User.js';
import { cancelOrder } from '../../src/services/orders/cancelOrder.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { addDays, bangladeshDate, bangladeshDayStart } from '../../src/utils/dates.js';

import express from 'express';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { createForecastRouter } from '../../src/routes/forecast.js';

const tokens = createTokenService(makeTestEnv());
const fullApp = makeTestApp(); // only used to check the route is part of the real app

// The route caches answers for ten minutes, which would leak one test's data into the next.
// Each request gets its own copy with the cache off (or with a clock the test controls).
const appWith = (options = {}) => {
  const mini = express();
  mini.use('/api/forecast', createForecastRouter({ tokens, cacheMs: 0, ...options }));
  mini.use(errorHandler({ error() {} }));
  return mini;
};

let today;
let farmer;
let pendingFarmer;
let admin;
let customer;

const get = (query, user = farmer, app = appWith()) =>
  request(app)
    .get(`/api/forecast${query}`)
    .set('Authorization', `Bearer ${tokens.sign(user)}`);

// An order placed today, moved to the middle of yesterday (Bangladesh time).
const orderYesterday = async () => {
  const placed = await placeOrderFor(customer, today);
  const yesterday = bangladeshDayStart(addDays(bangladeshDate(), -1));
  await Order.collection.updateOne(
    { code: placed.code },
    { $set: { createdAt: new Date(yesterday.getTime() + 6 * 3600 * 1000) } },
  );
  return placed;
};

beforeAll(async () => {
  await startTestDb();
  await User.init();
  farmer = await makeUser(1, 'farmer');
  pendingFarmer = await makeUser(2, 'farmer', 'pending');
  admin = await makeUser(3, 'admin');
  customer = await makeUser(4, 'customer');
});
afterAll(stopTestDb);
beforeEach(async () => {
  ({ today } = await setUpShelf());
  // No seasons, so the expected numbers never depend on today's date.
  await Produce.updateMany({}, { peakMonths: [] });
});

describe('GET /api/forecast: access', () => {
  it('is for approved farmers and admins only', async () => {
    expect((await request(fullApp).get('/api/forecast?city=dhaka')).status).toBe(401);
    expect((await get('?city=dhaka', customer)).status).toBe(403);
    const unapproved = await get('?city=dhaka', pendingFarmer);
    expect(unapproved.status).toBe(403);
    expect(unapproved.body.error.code).toBe('account_pending');
    expect((await get('?city=dhaka', farmer)).status).toBe(200);
    expect((await get('?city=dhaka', admin)).status).toBe(200);
  });

  it('is wired into the real app', async () => {
    const res = await get('?city=dhaka', farmer, fullApp);
    expect(res.status).toBe(200);
    expect(res.body.cityCode).toBe('dhaka');
  });

  it('rejects a missing or malformed city, a bad number of days, and an unknown city', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('?city=BAD CITY')).status).toBe(400);
    for (const days of [0, 15, 'x'])
      expect((await get(`?city=dhaka&days=${days}`)).status).toBe(400);
    const unknown = await get('?city=nowhere');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('city_not_found');
  });
});

describe('GET /api/forecast', () => {
  it('lists every active produce, busiest first, with zeros where nobody ordered', async () => {
    await orderYesterday();
    await orderYesterday();

    const res = await get('?city=dhaka');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cityCode: 'dhaka', asOf: today, horizonDays: 7 });
    expect(res.body.forecasts).toHaveLength(26);
    expect(res.body.forecasts.slice(0, 2).map((f) => f.produceSlug)).toEqual(['cabbage', 'tomato']);

    const tomato = res.body.forecasts.find((f) => f.produceSlug === 'tomato');
    // 6 kg on one day out of the last 56: about 0.11 kg a day, flagged as low confidence.
    expect(tomato).toMatchObject({
      nameEn: 'Tomato',
      nameBn: 'টমেটো',
      confidence: 'low',
      historyDays: 56,
      activeDays: 1,
      totalKg: 0.77,
    });
    expect(tomato.daily).toHaveLength(7);
    expect(tomato.daily[0].date).toBe(today);
    expect(tomato.daily.every((day) => day.kg === 0.11)).toBe(true);

    const quiet = res.body.forecasts.find((f) => f.produceSlug === 'okra');
    expect(quiet).toMatchObject({ totalKg: 0, confidence: 'low', activeDays: 0 });
  });

  it('does not count cancelled orders', async () => {
    await orderYesterday();
    const cancelled = await orderYesterday();
    await cancelOrder({ customer: { _id: customer._id }, code: cancelled.code });

    const res = await get('?city=dhaka');
    const tomato = res.body.forecasts.find((f) => f.produceSlug === 'tomato');
    // 3 kg over 56 days is 0.054 kg a day, which rounds to 0.05 each day: 7 x 0.05 = 0.35.
    expect(tomato.totalKg).toBe(0.35);
  });

  it("does not use another city's demand", async () => {
    await orderYesterday();
    const res = await get('?city=chattogram');
    expect(res.body.forecasts.every((f) => f.totalKg === 0)).toBe(true);
  });

  it('forecasts as many days as asked', async () => {
    const res = await get('?city=dhaka&days=14');
    expect(res.body.horizonDays).toBe(14);
    expect(res.body.forecasts[0].daily).toHaveLength(14);
  });

  it('leaves out produce that is no longer active', async () => {
    await Produce.updateOne({ slug: 'tomato' }, { active: false });
    const res = await get('?city=dhaka');
    expect(res.body.forecasts).toHaveLength(25);
    expect(res.body.forecasts.some((f) => f.produceSlug === 'tomato')).toBe(false);
  });

  it('contains only totals, no customer details', async () => {
    await orderYesterday();
    const text = JSON.stringify((await get('?city=dhaka')).body);
    expect(text).not.toMatch(/Rahim|Mirpur 10|8801|ORD-|person/i);
  });
});

describe('caching', () => {
  it('serves a cached forecast until the cache expires', async () => {
    let clock = 1_000_000;
    const app = appWith({ cacheMs: 60_000, now: () => clock });
    const tomatoKg = async () => {
      const res = await get('?city=dhaka', farmer, app);
      return res.body.forecasts.find((f) => f.produceSlug === 'tomato').totalKg;
    };

    await orderYesterday();
    expect(await tomatoKg()).toBe(0.35);
    await orderYesterday();
    expect(await tomatoKg()).toBe(0.35); // still the cached answer
    clock += 61_000;
    expect(await tomatoKg()).toBe(0.77); // expired, so it sees both orders
  });
});
