import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeProfile, makeUser, placeOrderFor } from '../helpers/deliveryFixture.js';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { Order } from '../../src/models/Order.js';
import { Payment } from '../../src/models/Payment.js';
import { RiderProfile } from '../../src/models/RiderProfile.js';
import { Run } from '../../src/models/Run.js';
import { User } from '../../src/models/User.js';
import { dispatchCity } from '../../src/services/dispatch/dispatchCity.js';
import { cancelOrder } from '../../src/services/orders/cancelOrder.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { deriveOtp } from '../../src/utils/otp.js';

const env = makeTestEnv();
const tokens = createTokenService(env);
const app = makeTestApp();

let today;
let customer;
let r1;
let r2;
let customerToken;
let t1;
let t2;
let o1;
let o2;
let run;

const as = (token) => ({ Authorization: `Bearer ${token}` });
const base = (path = '') => `/api/rider/runs/${run.code}${path}`;
const start = (token = t1) => request(app).post(base('/start')).set(as(token));
const deliver = (orderCode, otp, token = t1) =>
  request(app)
    .post(base(`/stops/${orderCode}/deliver`))
    .set(as(token))
    .send({ otp });
const fail = (orderCode, reason = 'Customer not home', token = t1) =>
  request(app)
    .post(base(`/stops/${orderCode}/fail`))
    .set(as(token))
    .send({ reason });
const otpOf = async (code) => {
  const order = await Order.findOne({ code }).select('+otpSalt');
  return deriveOtp(env.JWT_SECRET, code, order.otpSalt);
};
const wrongOtp = async (code) => ((await otpOf(code)) === '000000' ? '000001' : '000000');
const orderOf = (code) => Order.findOne({ code });
const runDoc = () => Run.findOne({ code: run.code });

beforeAll(async () => {
  await startTestDb();
  await Promise.all([User.init(), Run.init(), RiderProfile.init()]);
  customer = await makeUser(1, 'customer');
  r1 = await makeUser(2, 'rider');
  r2 = await makeUser(3, 'rider');
  customerToken = tokens.sign(customer);
  t1 = tokens.sign(r1);
  t2 = tokens.sign(r2);
});
afterAll(stopTestDb);
beforeEach(async () => {
  ({ today } = await setUpShelf());
  await makeProfile(r1, ['dhaka-mirpur', 'dhaka-uttara']);
  o1 = await placeOrderFor(customer, today, { zoneCode: 'dhaka-mirpur' });
  o2 = await placeOrderFor(customer, today, { zoneCode: 'dhaka-uttara' });
  await dispatchCity({ cityCode: 'dhaka' });
  run = await Run.findOne();
});

describe('rider access and reading', () => {
  it('is for approved riders only', async () => {
    expect((await request(app).get('/api/rider/runs')).status).toBe(401);
    expect((await request(app).get('/api/rider/runs').set(as(customerToken))).status).toBe(403);
  });

  it('lists your runs and shows each stop with the cash to collect, never the code', async () => {
    const list = await request(app).get('/api/rider/runs').set(as(t1));
    expect(list.body).toMatchObject({ total: 1 });
    expect(list.body.runs[0]).toMatchObject({ code: run.code, status: 'planned' });

    const res = await request(app).get(base()).set(as(t1));
    expect(res.status).toBe(200);
    expect(res.body.run.stops).toHaveLength(2);
    expect(res.body.run.stops[0]).toMatchObject({
      recipientName: 'Rahim Uddin',
      phone: '+8801712345678',
      address: { line: 'House 12, Road 3, Mirpur 10' },
      collectBdt: 376,
      status: 'pending',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/otp/i);
  });

  it("hides another rider's run", async () => {
    expect((await request(app).get(base()).set(as(t2))).status).toBe(404);
    const list = await request(app).get('/api/rider/runs').set(as(t2));
    expect(list.body.total).toBe(0);
  });

  it('shows the profile, toggles duty, and says when there is no profile', async () => {
    const me = await request(app).get('/api/rider/me').set(as(t1));
    expect(me.body.profile).toMatchObject({ vehicle: 'bike', onDuty: true });
    const off = await request(app).post('/api/rider/duty').set(as(t1)).send({ onDuty: false });
    expect(off.body.profile.onDuty).toBe(false);

    const missing = await request(app).get('/api/rider/me').set(as(t2));
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('profile_missing');
    expect(
      (await request(app).post('/api/rider/duty').set(as(t1)).send({ onDuty: 'yes' })).status,
    ).toBe(400);
  });
});

describe('starting a run', () => {
  it('sends the orders out for delivery', async () => {
    const res = await start();
    expect(res.status).toBe(200);
    expect(res.body.run).toMatchObject({ status: 'in_progress' });
    expect(res.body.run.startedAt).toBeTypeOf('string');

    for (const code of [o1.code, o2.code]) {
      const order = await orderOf(code);
      expect(order.status).toBe('out_for_delivery');
      expect(order.statusHistory.map((h) => h.status)).toEqual(['placed', 'out_for_delivery']);
    }
  });

  it('cannot be started twice, or by another rider', async () => {
    await start();
    const again = await start();
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('run_not_startable');
    expect((await start(t2)).status).toBe(404);
  });

  it('lets a rider be out on only one run at a time', async () => {
    await placeOrderFor(customer, today, { zoneCode: 'dhaka-mirpur' });
    await dispatchCity({ cityCode: 'dhaka' });
    const second = await Run.findOne({ code: { $ne: run.code } });

    await start();
    const res = await request(app).post(`/api/rider/runs/${second.code}/start`).set(as(t1));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('run_in_progress');
  });

  it('skips an order the customer cancelled before the run started', async () => {
    await cancelOrder({ customer: { _id: customer._id }, code: o1.code });
    const res = await start();

    const stop = (code) => res.body.run.stops.find((s) => s.orderCode === code);
    expect(stop(o1.code).status).toBe('skipped');
    expect(stop(o2.code).status).toBe('pending');
    expect((await orderOf(o1.code)).status).toBe('cancelled');
  });

  it('finishes straight away when every order was cancelled', async () => {
    await cancelOrder({ customer: { _id: customer._id }, code: o1.code });
    await cancelOrder({ customer: { _id: customer._id }, code: o2.code });
    expect((await start()).body.run.status).toBe('completed');
  });
});

describe('delivering a stop', () => {
  it('delivers with the right code, collects the cash, and completes the run', async () => {
    await start();

    const first = await deliver(o1.code, await otpOf(o1.code));
    expect(first.status).toBe(200);
    expect(first.body.run.status).toBe('in_progress');
    expect(first.body.run.stops.find((s) => s.orderCode === o1.code).status).toBe('delivered');
    expect(await orderOf(o1.code)).toMatchObject({ status: 'delivered', paymentStatus: 'paid' });
    expect((await Payment.findOne({ orderCode: o1.code })).status).toBe('succeeded');

    const last = await deliver(o2.code, await otpOf(o2.code));
    expect(last.body.run.status).toBe('completed');
    expect((await runDoc()).completedAt).toBeInstanceOf(Date);
    expect((await orderOf(o2.code)).statusHistory.map((h) => h.status)).toEqual([
      'placed',
      'out_for_delivery',
      'delivered',
    ]);
  });

  it('counts wrong codes, then locks the stop, even for the right code', async () => {
    await start();
    const wrong = await wrongOtp(o1.code);

    const first = await deliver(o1.code, wrong);
    expect(first.status).toBe(400);
    expect(first.body.error).toMatchObject({ code: 'invalid_otp', details: { attemptsLeft: 4 } });
    for (let i = 0; i < 4; i++) expect((await deliver(o1.code, wrong)).status).toBe(400);

    const locked = await deliver(o1.code, await otpOf(o1.code));
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('otp_locked');
    expect((await orderOf(o1.code)).status).toBe('out_for_delivery');
  });

  it('does not let a rider guess faster by sending codes in parallel', async () => {
    await start();
    const wrong = await wrongOtp(o1.code);
    await Promise.all(Array.from({ length: 12 }, () => deliver(o1.code, wrong)));
    expect((await orderOf(o1.code)).otpAttempts).toBe(5);
  });

  it('refuses before the run starts, for unknown stops, other riders and malformed codes', async () => {
    const early = await deliver(o1.code, '123456');
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('run_not_in_progress');

    await start();
    expect((await deliver('ORD-AAAAAAAA', '123456')).body.error.code).toBe('stop_not_found');
    expect((await deliver(o1.code, '123456', t2)).status).toBe(404);
    expect((await deliver(o1.code, '12345')).status).toBe(400);
    expect((await deliver(o1.code, 'abcdef')).status).toBe(400);
  });

  it('cannot deliver the same stop twice', async () => {
    await start();
    await deliver(o1.code, await otpOf(o1.code));
    const again = await deliver(o1.code, await otpOf(o1.code));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('stop_not_pending');
  });

  it('finishes a delivery that was recorded on the order but not on the stop', async () => {
    await start();
    await Order.updateOne({ code: o1.code }, { status: 'delivered', deliveredAt: new Date() });

    const res = await deliver(o1.code, '000000');
    expect(res.status).toBe(200);
    expect(res.body.run.stops.find((s) => s.orderCode === o1.code).status).toBe('delivered');
    expect((await Payment.findOne({ orderCode: o1.code })).status).toBe('succeeded');
  });
});

describe('failing a stop', () => {
  it('sends the order back to the pool, and the next dispatch picks it up again', async () => {
    await start();
    await deliver(o1.code, await wrongOtp(o1.code));
    await deliver(o1.code, await wrongOtp(o1.code));

    const res = await fail(o1.code, 'Customer not home');
    expect(res.status).toBe(200);
    expect(res.body.run.stops.find((s) => s.orderCode === o1.code)).toMatchObject({
      status: 'failed',
      failReason: 'Customer not home',
    });

    const order = await orderOf(o1.code);
    expect(order).toMatchObject({ status: 'placed', runCode: null, otpAttempts: 0 });
    expect(order.statusHistory.at(-1).status).toBe('placed');

    const next = await dispatchCity({ cityCode: 'dhaka' });
    expect(next.runs.flatMap((r) => r.stops.map((s) => s.orderCode))).toEqual([o1.code]);
  });

  it('completes the run once every stop is delivered or failed', async () => {
    await start();
    await fail(o1.code);
    const done = await deliver(o2.code, await otpOf(o2.code));
    expect(done.body.run.status).toBe('completed');
  });

  it('refuses a stop that is already delivered, and a missing reason', async () => {
    await start();
    await deliver(o1.code, await otpOf(o1.code));
    expect((await fail(o1.code)).status).toBe(409);
    expect((await fail(o2.code, 'x')).status).toBe(400);
    expect((await fail(o2.code, 'Customer not home', t2)).status).toBe(404);
  });
});
