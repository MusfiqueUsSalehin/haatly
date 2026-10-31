import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeProfile, makeUser, placeOrderFor } from '../helpers/deliveryFixture.js';
import { emitWithAck, expectNothing, startRealtime, waitFor } from '../helpers/realtimeServer.js';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { RiderProfile } from '../../src/models/RiderProfile.js';
import { Run } from '../../src/models/Run.js';
import { User } from '../../src/models/User.js';
import { dispatchCity } from '../../src/services/dispatch/dispatchCity.js';
import { startRun } from '../../src/services/dispatch/riderRuns.js';
import { createTokenService } from '../../src/services/tokenService.js';

const env = makeTestEnv();
const tokens = createTokenService(env);
const tokenOf = (user) => tokens.sign(user);
const rejection = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return null;
};
const setStatus = (user, status) => User.updateOne({ _id: user._id }, { status });

let rt;
let today;
let c1;
let c2;
let rider;
let admin;
let o1;
let o2;
let run;

const subscribe = (socket, orderCode) => emitWithAck(socket, 'order:subscribe', { orderCode });
const sendLocation = (socket, payload) => emitWithAck(socket, 'rider:location', payload);
const spot = { lat: 23.8223, lng: 90.3654 };

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
  await dispatchCity({ cityCode: 'dhaka' });
  run = await Run.findOne();
});

describe('connecting', () => {
  it('lets a signed-in user connect', async () => {
    const socket = await rt.connectAs(tokenOf(c1));
    expect(socket.connected).toBe(true);
  });

  it('refuses a missing or invalid token', async () => {
    const none = await rejection(rt.connectAs(undefined));
    expect(none.data.code).toBe('unauthenticated');
    const bad = await rejection(rt.connectAs('not.a.token'));
    expect(bad.data.code).toBe('invalid_token');
    const expired = jwt.sign({}, env.JWT_SECRET, { subject: String(c1._id), expiresIn: -10 });
    expect((await rejection(rt.connectAs(expired))).data.code).toBe('invalid_token');
  });

  it('refuses a suspended account, and a user who no longer exists', async () => {
    await setStatus(c1, 'suspended');
    try {
      expect((await rejection(rt.connectAs(tokenOf(c1)))).data.code).toBe('account_suspended');
    } finally {
      await setStatus(c1, 'active');
    }

    const ghost = await makeUser(9, 'customer');
    const token = tokenOf(ghost);
    await User.deleteOne({ _id: ghost._id });
    expect((await rejection(rt.connectAs(token))).data.code).toBe('invalid_token');
  });

  it('ends the session when the token expires', async () => {
    const short = jwt.sign({}, env.JWT_SECRET, { subject: String(c1._id), expiresIn: 2 });
    const socket = await rt.connectAs(short);
    const expired = waitFor(socket, 'session:expired', 5000);
    const closed = new Promise((resolve) => socket.once('disconnect', resolve));
    await expired;
    await closed;
    expect(socket.connected).toBe(false);
  });
});

describe('following an order', () => {
  it('lets a customer follow their own order and receive updates', async () => {
    const socket = await rt.connectAs(tokenOf(c1));
    expect(await subscribe(socket, o1.code)).toEqual({ ok: true });

    const update = waitFor(socket, 'order:update');
    rt.realtime.emitToOrder(o1.code, 'order:update', { status: 'out_for_delivery' });
    expect(await update).toEqual({ status: 'out_for_delivery' });
  });

  it("keeps another customer's order private, and answers the same as for a missing order", async () => {
    const socket = await rt.connectAs(tokenOf(c2));
    const notYours = await subscribe(socket, o1.code);
    const missing = await subscribe(socket, 'ORD-AAAAAAAA');
    expect(notYours).toEqual({ ok: false, error: 'not_found' });
    expect(missing).toEqual(notYours);

    const quiet = expectNothing(socket, 'order:update');
    rt.realtime.emitToOrder(o1.code, 'order:update', { status: 'delivered' });
    await quiet;
  });

  it('lets an admin follow any order, but not a rider', async () => {
    const adminSocket = await rt.connectAs(tokenOf(admin));
    expect(await subscribe(adminSocket, o1.code)).toEqual({ ok: true });
    const riderSocket = await rt.connectAs(tokenOf(rider));
    expect(await subscribe(riderSocket, o1.code)).toEqual({ ok: false, error: 'not_found' });
  });

  it('rejects malformed requests, including attempts to inject a query', async () => {
    const socket = await rt.connectAs(tokenOf(c1));
    const bad = { ok: false, error: 'invalid_order_code' };
    expect(await subscribe(socket, 'bad')).toEqual(bad);
    expect(await subscribe(socket, { $ne: null })).toEqual(bad);
    expect(await emitWithAck(socket, 'order:subscribe', null)).toEqual(bad);
  });

  it('stops delivering updates after unsubscribing', async () => {
    const socket = await rt.connectAs(tokenOf(c1));
    await subscribe(socket, o1.code);
    await emitWithAck(socket, 'order:unsubscribe', { orderCode: o1.code });

    const quiet = expectNothing(socket, 'order:update');
    rt.realtime.emitToOrder(o1.code, 'order:update', { status: 'delivered' });
    await quiet;
  });

  it('notices a suspension on a connection that is already open', async () => {
    const socket = await rt.connectAs(tokenOf(c1));
    await setStatus(c1, 'suspended');
    try {
      expect(await subscribe(socket, o1.code)).toEqual({ ok: false, error: 'not_found' });
    } finally {
      await setStatus(c1, 'active');
    }
  });

  it('limits how many requests one connection can make', async () => {
    const socket = await rt.connectAs(tokenOf(c1));
    for (let i = 0; i < 30; i++) await subscribe(socket, 'bad');
    expect(await subscribe(socket, o1.code)).toEqual({ ok: false, error: 'too_many_requests' });
  });
});

describe('targeted messages', () => {
  it('reaches only the chosen user, or only admins', async () => {
    const s1 = await rt.connectAs(tokenOf(c1));
    const s2 = await rt.connectAs(tokenOf(c2));
    const sa = await rt.connectAs(tokenOf(admin));

    const forC1 = waitFor(s1, 'note');
    const quiet = Promise.all([expectNothing(s2, 'note'), expectNothing(sa, 'note')]);
    rt.realtime.emitToUser(c1._id, 'note', { hello: 'c1' });
    expect(await forC1).toEqual({ hello: 'c1' });
    await quiet;

    const forAdmin = waitFor(sa, 'alert');
    const noCustomers = Promise.all([expectNothing(s1, 'alert'), expectNothing(s2, 'alert')]);
    rt.realtime.emitToAdmins('alert', { n: 1 });
    expect(await forAdmin).toEqual({ n: 1 });
    await noCustomers;
  });
});

describe('rider location', () => {
  it('needs an active run first', async () => {
    const socket = await rt.connectAs(tokenOf(rider));
    expect(await sendLocation(socket, spot)).toEqual({ ok: false, error: 'no_active_run' });
  });

  it('reaches the customers of pending stops and admins, and nobody else', async () => {
    await startRun({ rider, code: run.code });
    const s1 = await rt.connectAs(tokenOf(c1));
    const s2 = await rt.connectAs(tokenOf(c2));
    const sa = await rt.connectAs(tokenOf(admin));
    const riderSocket = await rt.connectAs(tokenOf(rider));
    await subscribe(s1, o1.code);
    await subscribe(s2, o2.code);

    const got1 = waitFor(s1, 'rider:location');
    const got2 = waitFor(s2, 'rider:location');
    const gotAdmin = waitFor(sa, 'run:location');
    const ack = await sendLocation(riderSocket, spot);

    expect(ack).toEqual({ ok: true, deliveredTo: 2 });
    const first = await got1;
    expect(first).toMatchObject({ orderCode: o1.code, lat: 23.8223, lng: 90.3654 });
    expect(Object.keys(first).sort()).toEqual(['at', 'lat', 'lng', 'orderCode']);
    expect((await got2).orderCode).toBe(o2.code);
    expect(await gotAdmin).toMatchObject({ runCode: run.code, riderId: String(rider._id) });
  });

  it('stops telling a customer once their stop is no longer pending', async () => {
    await startRun({ rider, code: run.code });
    await Run.updateOne(
      { code: run.code, 'stops.orderCode': o1.code },
      { $set: { 'stops.$.status': 'delivered' } },
    );
    const s1 = await rt.connectAs(tokenOf(c1));
    const s2 = await rt.connectAs(tokenOf(c2));
    const riderSocket = await rt.connectAs(tokenOf(rider));
    await subscribe(s1, o1.code);
    await subscribe(s2, o2.code);

    const quiet = expectNothing(s1, 'rider:location');
    const got2 = waitFor(s2, 'rider:location');
    expect(await sendLocation(riderSocket, spot)).toEqual({ ok: true, deliveredTo: 1 });
    await got2;
    await quiet;
  });

  it('uses the server time and drops extra fields', async () => {
    await startRun({ rider, code: run.code });
    const s1 = await rt.connectAs(tokenOf(c1));
    const riderSocket = await rt.connectAs(tokenOf(rider));
    await subscribe(s1, o1.code);

    const got = waitFor(s1, 'rider:location');
    await sendLocation(riderSocket, { ...spot, at: '1999-01-01T00:00:00Z', riderId: 'x' });
    const message = await got;
    expect(message.riderId).toBeUndefined();
    expect(Math.abs(Date.parse(message.at) - Date.now())).toBeLessThan(5000);
  });

  it('rejects bad locations', async () => {
    await startRun({ rider, code: run.code });
    const socket = await rt.connectAs(tokenOf(rider));

    expect(await sendLocation(socket, { lat: 0, lng: 0 })).toEqual({
      ok: false,
      error: 'invalid_location',
    });
  });

  it('allows one location every two seconds, and every message counts', async () => {
    await startRun({ rider, code: run.code });
    const socket = await rt.connectAs(tokenOf(rider));

    expect((await sendLocation(socket, spot)).ok).toBe(true);
    expect(await sendLocation(socket, spot)).toEqual({ ok: false, error: 'too_fast' });
    // Even a bad message used up the slot, so it is told to slow down rather than "invalid".
    expect(await sendLocation(socket, { lat: 0, lng: 0 })).toEqual({
      ok: false,
      error: 'too_fast',
    });

    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect((await sendLocation(socket, spot)).ok).toBe(true);
  });

  it('is only for approved riders with a run in progress', async () => {
    const customerSocket = await rt.connectAs(tokenOf(c1));
    expect(await sendLocation(customerSocket, spot)).toEqual({ ok: false, error: 'forbidden' });
    const adminSocket = await rt.connectAs(tokenOf(admin));
    expect(await sendLocation(adminSocket, spot)).toEqual({ ok: false, error: 'forbidden' });

    await startRun({ rider, code: run.code });
    const riderSocket = await rt.connectAs(tokenOf(rider));
    await setStatus(rider, 'pending');
    try {
      expect(await sendLocation(riderSocket, spot)).toEqual({ ok: false, error: 'forbidden' });
    } finally {
      await setStatus(rider, 'active');
    }
  });

  it('stops working once the run is completed', async () => {
    await startRun({ rider, code: run.code });
    await Run.updateOne({ code: run.code }, { status: 'completed', completedAt: new Date() });
    const socket = await rt.connectAs(tokenOf(rider));
    expect(await sendLocation(socket, spot)).toEqual({ ok: false, error: 'no_active_run' });
  });
});
