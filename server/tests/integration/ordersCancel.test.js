import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { Lot } from '../../src/models/Lot.js';
import { Order } from '../../src/models/Order.js';
import { User } from '../../src/models/User.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { createUser } from '../../src/services/userService.js';

const app = makeTestApp();
const tokens = createTokenService(makeTestEnv());

let today;
let customerToken;
let otherToken;

const as = (token) => ({ Authorization: `Bearer ${token}` });
const place = async (qty = 2, token = customerToken) => {
  const res = await request(app)
    .post('/api/orders')
    .set(as(token))
    .send({
      recipientName: 'Rahim Uddin',
      phone: '01712345678',
      zoneCode: 'dhaka-mirpur',
      address: { line: 'House 12, Road 3, Mirpur 10' },
      items: [{ boxCode: `dhaka-family-${today}`, qty, seenUnitPriceBdt: 168 }],
    });
  return res.body.order;
};
const cancel = (code, body, token = customerToken) => {
  const call = request(app).post(`/api/orders/${code}/cancel`).set(as(token));
  return body ? call.send(body) : call;
};
const remaining = async (code) => (await Lot.findOne({ code })).remainingKg;

beforeAll(async () => {
  await startTestDb();
  await User.init();
  const person = (n) => ({
    name: `Person ${n}`,
    email: `person${n}@example.com`,
    phone: '+8801712345678',
    password: 'a-strong-password',
    role: 'customer',
    status: 'active',
  });
  customerToken = tokens.sign(await createUser(person(1)));
  otherToken = tokens.sign(await createUser(person(2)));
});
afterAll(stopTestDb);
beforeEach(async () => {
  ({ today } = await setUpShelf());
});

describe('POST /api/orders/:code/cancel', () => {
  it('cancels the order, records why, and puts the stock back', async () => {
    const order = await place(2);
    expect(await remaining('LOT-AAAAAAAA')).toBe(97);

    const res = await cancel(order.code, { reason: 'Changed my mind' });
    expect(res.status).toBe(200);
    expect(res.body.order).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Changed my mind',
    });
    expect(res.body.order).not.toHaveProperty('deliveryOtp');
    expect(res.body.order.cancelledAt).toBeTypeOf('string');
    expect(res.body.order.statusHistory.map((h) => h.status)).toEqual(['placed', 'cancelled']);
    expect(await remaining('LOT-AAAAAAAA')).toBe(100);
    expect(await remaining('LOT-DDDDDDDD')).toBe(100);
  });

  it('works with no request body at all', async () => {
    const order = await place(1);
    expect((await cancel(order.code)).status).toBe(200);
  });

  it('relists a lot that had sold out', async () => {
    await Lot.updateOne({ code: 'LOT-AAAAAAAA' }, { remainingKg: 3 });
    const order = await place(2);
    expect((await Lot.findOne({ code: 'LOT-AAAAAAAA' })).status).toBe('sold_out');

    await cancel(order.code);
    expect(await Lot.findOne({ code: 'LOT-AAAAAAAA' })).toMatchObject({
      remainingKg: 3,
      status: 'listed',
    });
  });

  it('cannot cancel twice, and the second try does not restore stock again', async () => {
    const order = await place(2);
    expect((await cancel(order.code)).status).toBe(200);

    const again = await cancel(order.code);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('order_not_cancellable');
    expect(await remaining('LOT-AAAAAAAA')).toBe(100);
  });

  it('restores the stock only once when two cancels arrive together', async () => {
    const order = await place(2);
    const results = await Promise.all([cancel(order.code), cancel(order.code)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await remaining('LOT-AAAAAAAA')).toBe(100);
    expect(await remaining('LOT-DDDDDDDD')).toBe(100);
  });

  it.each(['out_for_delivery', 'delivered'])('refuses an order that is %s', async (status) => {
    const order = await place(2);
    await Order.updateOne({ code: order.code }, { status, deliveredAt: new Date() });
    const res = await cancel(order.code);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain(status.replaceAll('_', ' '));
    expect(await remaining('LOT-AAAAAAAA')).toBe(97);
  });

  it("will not touch another customer's order", async () => {
    const order = await place(2);
    const res = await cancel(order.code, undefined, otherToken);
    expect(res.status).toBe(404);
    expect((await Order.findOne({ code: order.code })).status).toBe('placed');
  });

  it('rejects an unknown code, a malformed one, and an over-long reason', async () => {
    expect((await cancel('ORD-AAAAAAAA')).status).toBe(404);
    expect((await cancel('BAD-CODE')).status).toBe(400);
    const order = await place(1);
    expect((await cancel(order.code, { reason: 'x'.repeat(201) })).status).toBe(400);
  });

  it('requires a signed-in customer', async () => {
    const order = await place(1);
    expect((await request(app).post(`/api/orders/${order.code}/cancel`)).status).toBe(401);
  });
});
