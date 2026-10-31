import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeProfile, makeUser, placeOrderFor } from '../helpers/deliveryFixture.js';
import { emitWithAck, startRealtime, waitFor } from '../helpers/realtimeServer.js';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { Order } from '../../src/models/Order.js';
import { Payment } from '../../src/models/Payment.js';
import { RiderProfile } from '../../src/models/RiderProfile.js';
import { Run } from '../../src/models/Run.js';
import { User } from '../../src/models/User.js';
import { subscribe } from '../../src/realtime/events.js';
import { dispatchCity } from '../../src/services/dispatch/dispatchCity.js';
import { deliverStop, failStop, startRun } from '../../src/services/dispatch/riderRuns.js';
import { cancelOrder } from '../../src/services/orders/cancelOrder.js';
import { expireUnpaidOrders } from '../../src/services/payments/maintenance.js';
import { createSandboxProvider } from '../../src/services/payments/sandbox.js';
import { handleWebhook } from '../../src/services/payments/webhook.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { deriveOtp } from '../../src/utils/otp.js';

const env = makeTestEnv();
const tokens = createTokenService(env);
const gateway = createSandboxProvider({ webhookSecret: env.PAYMENT_WEBHOOK_SECRET });

let rt;
let today;
let c1;
let c2;
let rider;
let admin;
let o1;
let o2;

const connectAs = (user) => rt.connectAs(tokens.sign(user));
const follow = (socket, orderCode) => emitWithAck(socket, 'order:subscribe', { orderCode });
const collect = (socket, event) => {
  const got = [];
  socket.on(event, (data) => got.push(data));
  return got;
};
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const none = { pending: 0, delivered: 0, failed: 0, skipped: 0 };

const otpOf = async (code) => {
  const order = await Order.findOne({ code }).select('+otpSalt');
  return deriveOtp(env.JWT_SECRET, code, order.otpSalt);
};
const deliver = async (run, orderCode) =>
  deliverStop({
    rider,
    code: run.code,
    orderCode,
    otp: await otpOf(orderCode),
    otpSecret: env.JWT_SECRET,
  });
const pay = async (order, outcome = 'succeeded') => {
  const { providerRef } = await Payment.findOne({ orderCode: order.code });
  const event = gateway.buildEvent({
    providerRef,
    orderCode: order.code,
    amountBdt: order.totalBdt,
    outcome,
  });
  return handleWebhook({
    rawBody: event.rawBody,
    timestamp: event.headers['x-haatly-timestamp'],
    signature: event.headers['x-haatly-signature'],
    secret: env.PAYMENT_WEBHOOK_SECRET,
    provider: gateway,
  });
};
const dispatchRun = async () => {
  await dispatchCity({ cityCode: 'dhaka' });
  return Run.findOne();
};

beforeAll(async () => {
  await startTestDb();
  await Promise.all([User.init(), Run.init(), RiderProfile.init()]);
  rt = await startRealtime();
  c1 = await makeUser(1, 'customer');
  c2 = await makeUser(2, 'customer');
  rider = await makeUser(3, 'rider');
  admin = await makeUser(4, 'admin');
});
afterAll(async () => {
  await rt.stop();
  await stopTestDb();
});
beforeEach(async () => {
  ({ today } = await setUpShelf());
  await makeProfile(rider, ['dhaka-mirpur', 'dhaka-uttara']);
  o1 = await placeOrderFor(c1, today, { zoneCode: 'dhaka-mirpur' });
  o2 = await placeOrderFor(c2, today, { zoneCode: 'dhaka-uttara' });
});

describe('order events', () => {
  it('tells admins about a new order, without personal details', async () => {
    const sa = await connectAs(admin);
    const seen = waitFor(sa, 'admin:order');
    const order = await placeOrderFor(c1, today);

    const message = await seen;
    expect(message).toEqual({
      type: 'placed',
      orderCode: order.code,
      cityCode: 'dhaka',
      zoneCode: 'dhaka-mirpur',
      totalBdt: 376,
      paymentMethod: 'cod',
    });
    expect(JSON.stringify(message)).not.toMatch(/Rahim|Mirpur 10|8801/);
  });

  it('tells the customer, their order list and admins when an order is cancelled', async () => {
    const s1 = await connectAs(c1);
    const sa = await connectAs(admin);
    await follow(s1, o1.code);
    const update = waitFor(s1, 'order:update');
    const nudge = waitFor(s1, 'orders:changed');
    const adminSaw = waitFor(sa, 'admin:order');

    await cancelOrder({ customer: { _id: c1._id }, code: o1.code });

    expect(await update).toEqual({
      orderCode: o1.code,
      status: 'cancelled',
      paymentStatus: 'unpaid',
    });
    expect(await nudge).toEqual({ orderCode: o1.code });
    expect(await adminSaw).toMatchObject({
      type: 'updated',
      orderCode: o1.code,
      status: 'cancelled',
    });
  });

  it("does not tell other customers about someone else's order", async () => {
    const s1 = await connectAs(c1);
    const s2 = await connectAs(c2);
    await follow(s1, o1.code);
    await follow(s2, o2.code);
    const owner = waitFor(s1, 'order:update');
    const strangerUpdates = collect(s2, 'order:update');
    const strangerNudges = collect(s2, 'orders:changed');

    await cancelOrder({ customer: { _id: c1._id }, code: o1.code });
    await owner;
    await settle();

    expect(strangerUpdates).toEqual([]);
    expect(strangerNudges).toEqual([]);
  });

  it('tells a follower the moment a wallet payment is confirmed, without the code', async () => {
    const wallet = await placeOrderFor(c1, today, { paymentMethod: 'wallet' });
    const s1 = await connectAs(c1);
    await follow(s1, wallet.code);
    const update = waitFor(s1, 'order:update');

    expect(await pay(wallet)).toMatchObject({ outcome: 'paid' });

    const message = await update;
    expect(message).toEqual({ orderCode: wallet.code, status: 'placed', paymentStatus: 'paid' });
    expect(JSON.stringify(message)).not.toMatch(/otp/i);
  });

  it('tells a follower when a wallet payment fails', async () => {
    const wallet = await placeOrderFor(c1, today, { paymentMethod: 'wallet' });
    const s1 = await connectAs(c1);
    await follow(s1, wallet.code);
    const update = waitFor(s1, 'order:update');

    await pay(wallet, 'failed');
    expect(await update).toEqual({
      orderCode: wallet.code,
      status: 'cancelled',
      paymentStatus: 'unpaid',
    });
  });

  it('tells a follower when an unpaid order expires', async () => {
    const wallet = await placeOrderFor(c1, today, { paymentMethod: 'wallet' });
    await Payment.updateOne(
      { orderCode: wallet.code },
      { expiresAt: new Date(Date.now() - 60_000) },
    );
    const s1 = await connectAs(c1);
    await follow(s1, wallet.code);
    const update = waitFor(s1, 'order:update');

    expect(await expireUnpaidOrders()).toBe(1);
    expect(await update).toEqual({
      orderCode: wallet.code,
      status: 'cancelled',
      paymentStatus: 'unpaid',
    });
  });
});

describe('delivery events', () => {
  it('tells the rider and admins about a new run, and nobody else', async () => {
    const sr = await connectAs(rider);
    const sa = await connectAs(admin);
    const s1 = await connectAs(c1);
    const assigned = waitFor(sr, 'run:assigned');
    const adminSaw = waitFor(sa, 'admin:run');
    const customerSaw = collect(s1, 'run:assigned');

    const run = await dispatchRun();

    expect(await assigned).toEqual({ runCode: run.code, stopCount: 2 });
    expect(await adminSaw).toMatchObject({
      type: 'created',
      runCode: run.code,
      riderId: String(rider._id),
      cityCode: 'dhaka',
      status: 'planned',
      counts: { ...none, pending: 2 },
    });
    await settle();
    expect(customerSaw).toEqual([]);
  });

  it('tells customers their order is out for delivery when the run starts', async () => {
    const run = await dispatchRun();
    const s1 = await connectAs(c1);
    const sr = await connectAs(rider);
    const sa = await connectAs(admin);
    await follow(s1, o1.code);
    const update = waitFor(s1, 'order:update');
    const riderSaw = waitFor(sr, 'run:update');
    const adminSaw = waitFor(sa, 'admin:run');

    await startRun({ rider, code: run.code });

    expect(await update).toEqual({
      orderCode: o1.code,
      status: 'out_for_delivery',
      paymentStatus: 'unpaid',
    });
    expect(await riderSaw).toEqual({
      runCode: run.code,
      status: 'in_progress',
      counts: { ...none, pending: 2 },
    });
    expect(await adminSaw).toMatchObject({ type: 'updated', status: 'in_progress' });
  });

  it('tells the customer and the rider when a stop is delivered', async () => {
    const run = await dispatchRun();
    await startRun({ rider, code: run.code });
    const s1 = await connectAs(c1);
    const sr = await connectAs(rider);
    await follow(s1, o1.code);
    const update = waitFor(s1, 'order:update');
    const riderSaw = waitFor(sr, 'run:update');

    await deliver(run, o1.code);

    expect(await update).toEqual({
      orderCode: o1.code,
      status: 'delivered',
      paymentStatus: 'paid',
    });
    expect(await riderSaw).toEqual({
      runCode: run.code,
      status: 'in_progress',
      counts: { ...none, pending: 1, delivered: 1 },
    });
  });

  it('tells the rider when the whole run is completed', async () => {
    const run = await dispatchRun();
    await startRun({ rider, code: run.code });
    const sr = await connectAs(rider);
    const updates = collect(sr, 'run:update');

    await deliver(run, o1.code);
    await deliver(run, o2.code);
    await settle();

    expect(updates).toHaveLength(2);
    expect(updates.at(-1)).toEqual({
      runCode: run.code,
      status: 'completed',
      counts: { ...none, delivered: 2 },
    });
  });

  it('tells the customer their order is back in the queue when a stop fails', async () => {
    const run = await dispatchRun();
    await startRun({ rider, code: run.code });
    const s1 = await connectAs(c1);
    const sr = await connectAs(rider);
    await follow(s1, o1.code);
    const update = waitFor(s1, 'order:update');
    const riderSaw = waitFor(sr, 'run:update');

    await failStop({ rider, code: run.code, orderCode: o1.code, reason: 'Customer not home' });

    expect(await update).toEqual({ orderCode: o1.code, status: 'placed', paymentStatus: 'unpaid' });
    expect(await riderSaw).toEqual({
      runCode: run.code,
      status: 'in_progress',
      counts: { ...none, pending: 1, failed: 1 },
    });
  });
});

describe('safety', () => {
  it('never puts personal details or the delivery code in any live message', async () => {
    const s1 = await connectAs(c1);
    const sa = await connectAs(admin);
    await follow(s1, o1.code);
    const seen = [];
    for (const socket of [s1, sa]) socket.onAny((_event, data) => seen.push(JSON.stringify(data)));

    const run = await dispatchRun();
    await startRun({ rider, code: run.code });
    const otp = await otpOf(o1.code);
    await deliver(run, o1.code);
    await settle(500);

    const text = seen.join(' ');
    expect(seen.length).toBeGreaterThan(3);
    for (const secret of ['+8801712345678', 'Mirpur 10', 'Rahim', otp]) {
      expect(text).not.toContain(secret);
    }
  });

  it('never lets a broken listener break checkout', async () => {
    const off = subscribe(() => {
      throw new Error('boom');
    });
    try {
      const order = await placeOrderFor(c1, today);
      expect(order.code).toMatch(/^ORD-[A-HJ-NP-Z2-9]{8}$/);
    } finally {
      off();
    }
  });
});
