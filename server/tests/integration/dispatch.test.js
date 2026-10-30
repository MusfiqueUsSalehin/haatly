import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeProfile, makeUser, placeOrderFor } from '../helpers/deliveryFixture.js';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { RUN_CODE_PATTERN } from '../../src/constants/dispatch.js';
import { Order } from '../../src/models/Order.js';
import { RiderProfile } from '../../src/models/RiderProfile.js';
import { Run } from '../../src/models/Run.js';
import { User } from '../../src/models/User.js';
import { dispatchCity } from '../../src/services/dispatch/dispatchCity.js';
import { cancelOrder } from '../../src/services/orders/cancelOrder.js';
import { createTokenService } from '../../src/services/tokenService.js';

const tokens = createTokenService(makeTestEnv());
const app = makeTestApp();

let today;
let customer;
let r1;
let r2;
let pendingRider;
let adminToken;
let customerToken;
let riderToken;

const as = (token) => ({ Authorization: `Bearer ${token}` });
const place = (options) => placeOrderFor(customer, today, options);
const dispatch = () => dispatchCity({ cityCode: 'dhaka' });
const stopCodes = (run) => run.stops.map((stop) => stop.orderCode).sort();
const runOf = (runs, user) => runs.find((run) => String(run.rider) === String(user._id));

beforeAll(async () => {
  await startTestDb();
  await Promise.all([User.init(), Run.init(), RiderProfile.init()]);
  customer = await makeUser(1, 'customer');
  r1 = await makeUser(2, 'rider');
  r2 = await makeUser(3, 'rider');
  pendingRider = await makeUser(4, 'rider', 'pending');
  adminToken = tokens.sign(await makeUser(5, 'admin'));
  customerToken = tokens.sign(customer);
  riderToken = tokens.sign(r1);
});
afterAll(stopTestDb);
beforeEach(async () => {
  ({ today } = await setUpShelf());
});

describe('dispatchCity', () => {
  it('builds one run per rider from the zones they cover and claims the orders', async () => {
    await makeProfile(r1, ['dhaka-mirpur', 'dhaka-uttara']);
    await makeProfile(r2, ['dhaka-dhanmondi', 'dhaka-gulshan']);
    const o1 = await place({ zoneCode: 'dhaka-mirpur' });
    const o2 = await place({ zoneCode: 'dhaka-uttara' });
    const o3 = await place({ zoneCode: 'dhaka-dhanmondi' });

    const { runs, unassigned } = await dispatch();
    expect(unassigned).toEqual([]);
    expect(runs).toHaveLength(2);

    const first = runOf(runs, r1);
    expect(stopCodes(first)).toEqual([o1.code, o2.code].sort());
    expect(first).toMatchObject({
      trip: 1,
      status: 'planned',
      weightKg: 12,
      cityCode: 'dhaka',
      depotCode: 'dhaka-depot',
    });
    expect(first.code).toMatch(RUN_CODE_PATTERN);
    expect(stopCodes(runOf(runs, r2))).toEqual([o3.code]);

    expect(await Order.findOne({ code: o1.code })).toMatchObject({
      runCode: first.code,
      status: 'placed',
    });
  });

  it('only dispatches cash orders and paid wallet orders', async () => {
    await makeProfile(r1, ['dhaka-mirpur']);
    const cash = await place();
    const wallet = await place({ paymentMethod: 'wallet' });

    const first = await dispatch();
    expect(first.runs.flatMap(stopCodes)).toEqual([cash.code]);

    await Order.updateOne({ code: wallet.code }, { paymentStatus: 'paid' });
    const second = await dispatch();
    expect(second.runs.flatMap(stopCodes)).toEqual([wallet.code]);
  });

  it('ignores riders who are off duty or in another city, and leaves orders unclaimed', async () => {
    await makeProfile(r1, ['dhaka-mirpur'], { onDuty: false });
    await makeProfile(r2, ['chattogram-gec'], { cityCode: 'chattogram' });
    const order = await place();

    const { runs, unassigned } = await dispatch();
    expect(runs).toEqual([]);
    expect(unassigned).toEqual([{ orderCode: order.code, reason: 'no_riders' }]);
    expect((await Order.findOne({ code: order.code })).runCode).toBeNull();
  });

  it('does not use a rider who has not been approved', async () => {
    await makeProfile(pendingRider, ['dhaka-mirpur']);
    await place();
    expect((await dispatch()).runs).toEqual([]);
  });

  it('never puts an order in two runs, even when dispatch runs twice at once', async () => {
    await makeProfile(r1, ['dhaka-mirpur']);
    await makeProfile(r2, ['dhaka-mirpur']);
    const orders = [];
    for (let i = 0; i < 4; i++) orders.push(await place());

    await Promise.all([dispatch(), dispatch()]);

    const runs = await Run.find();
    const claimed = runs.flatMap(stopCodes);
    expect(claimed.sort()).toEqual(orders.map((o) => o.code).sort());
    for (const run of runs) {
      for (const stop of run.stops) {
        expect((await Order.findOne({ code: stop.orderCode })).runCode).toBe(run.code);
      }
    }
    expect((await dispatch()).runs).toEqual([]);
  });

  it('turns an overloaded rider into extra trips instead of dropping orders', async () => {
    await makeProfile(r1, ['dhaka-mirpur']); // a bike carries 40 kg
    for (let i = 0; i < 7; i++) await place(); // 7 orders x 6 kg = 42 kg

    const { runs, unassigned } = await dispatch();
    expect(unassigned).toEqual([]);
    expect(runs.map((run) => run.trip).sort()).toEqual([1, 2]);
    expect(runs.map((run) => run.stops.length).sort()).toEqual([1, 6]);
    for (const run of runs) expect(run.weightKg).toBeLessThanOrEqual(40);
  });

  it('leaves cancelled orders out', async () => {
    await makeProfile(r1, ['dhaka-mirpur']);
    const keep = await place();
    const gone = await place();
    await cancelOrder({ customer: { _id: customer._id }, code: gone.code });

    const { runs } = await dispatch();
    expect(runs.flatMap(stopCodes)).toEqual([keep.code]);
  });

  it('rejects an unknown city', async () => {
    await expect(dispatchCity({ cityCode: 'nowhere' })).rejects.toMatchObject({
      status: 404,
      code: 'city_not_found',
    });
  });
});

describe('admin dispatch endpoints', () => {
  const put = (id, body, token = adminToken) =>
    request(app).put(`/api/admin/riders/${id}`).set(as(token)).send(body);
  const profile = {
    cityCode: 'dhaka',
    vehicle: 'van',
    zoneCodes: ['dhaka-mirpur', 'dhaka-uttara'],
  };

  it('is for admins only', async () => {
    expect(
      (await request(app).post('/api/admin/dispatch').send({ cityCode: 'dhaka' })).status,
    ).toBe(401);
    const asCustomer = request(app).post('/api/admin/dispatch').set(as(customerToken));
    expect((await asCustomer.send({ cityCode: 'dhaka' })).status).toBe(403);
    expect((await request(app).get('/api/admin/runs').set(as(riderToken))).status).toBe(403);
  });

  it('sets up a rider, and keeps their duty status when the profile is updated', async () => {
    const created = await put(r1._id, profile);
    expect(created.status).toBe(200);
    expect(created.body.profile).toMatchObject({ ...profile, onDuty: false, user: String(r1._id) });

    await RiderProfile.updateOne({ user: r1._id }, { onDuty: true });
    const updated = await put(r1._id, { ...profile, vehicle: 'bike' });
    expect(updated.body.profile).toMatchObject({ vehicle: 'bike', onDuty: true });
    expect(await RiderProfile.countDocuments()).toBe(1);

    const list = await request(app).get('/api/admin/riders').set(as(adminToken));
    expect(list.body.riders).toEqual([
      expect.objectContaining({
        userId: String(r1._id),
        name: 'Person 2',
        vehicle: 'bike',
        onDuty: true,
      }),
    ]);
  });

  it('refuses people who are not approved riders, and bad zones, cities or vehicles', async () => {
    expect((await put(customer._id, profile)).status).toBe(404);
    const pending = await put(pendingRider._id, profile);
    expect(pending.status).toBe(409);
    expect(pending.body.error.code).toBe('rider_not_active');
    const badZone = await put(r1._id, { ...profile, zoneCodes: ['dhaka-nowhere'] });
    expect(badZone.status).toBe(400);
    expect(badZone.body.error.details.zoneCodes).toContain('dhaka-nowhere');
    expect((await put(r1._id, { ...profile, zoneCodes: ['chattogram-gec'] })).status).toBe(400);
    expect((await put(r1._id, { ...profile, cityCode: 'nowhere' })).status).toBe(404);
    expect((await put(r1._id, { ...profile, vehicle: 'jet' })).status).toBe(400);
    expect((await put('not-an-id', profile)).status).toBe(400);
  });

  it('dispatches from the API and lists the runs', async () => {
    await makeProfile(r1, ['dhaka-mirpur']);
    const order = await place();

    const res = await request(app)
      .post('/api/admin/dispatch')
      .set(as(adminToken))
      .send({ cityCode: 'dhaka' });
    expect(res.status).toBe(200);
    expect(res.body.runs).toHaveLength(1);
    expect(res.body.runs[0].stops.map((s) => s.orderCode)).toEqual([order.code]);

    const list = await request(app)
      .get('/api/admin/runs?status=planned&cityCode=dhaka')
      .set(as(adminToken));
    expect(list.body.total).toBe(1);
    expect((await request(app).get('/api/admin/runs?status=lost').set(as(adminToken))).status).toBe(
      400,
    );
  });
});
