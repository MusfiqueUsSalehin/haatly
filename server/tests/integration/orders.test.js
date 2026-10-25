import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { Lot } from '../../src/models/Lot.js';
import { Order } from '../../src/models/Order.js';
import { User } from '../../src/models/User.js';
import { createOrdersRouter } from '../../src/routes/orders.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { createUser } from '../../src/services/userService.js';
import { deriveOtp } from '../../src/utils/otp.js';

const env = makeTestEnv();
const app = makeTestApp();
const tokens = createTokenService(env);

let today;
let customer;
let customerToken;
let otherToken;
let farmerToken;

const as = (token) => ({ Authorization: `Bearer ${token}` });
const base = () => ({
  recipientName: 'Rahim Uddin',
  phone: '01712345678',
  zoneCode: 'dhaka-mirpur',
  address: { line: 'House 12, Road 3, Mirpur 10', landmark: 'Near the mosque' },
  items: [{ boxCode: `dhaka-family-${today}`, qty: 2, seenUnitPriceBdt: 168 }],
});
const place = (change = {}, token = customerToken) =>
  request(app)
    .post('/api/orders')
    .set(as(token))
    .send({ ...base(), ...change });
const get = (path, token = customerToken) => request(app).get(`/api/orders${path}`).set(as(token));

beforeAll(async () => {
  await startTestDb();
  await User.init();
  const person = (n, role) => ({
    name: `Person ${n}`,
    email: `person${n}@example.com`,
    phone: '+8801712345678',
    password: 'a-strong-password',
    role,
    status: 'active',
  });
  customer = await createUser(person(1, 'customer'));
  customerToken = tokens.sign(customer);
  otherToken = tokens.sign(await createUser(person(2, 'customer')));
  farmerToken = tokens.sign(await createUser(person(3, 'farmer')));
});
afterAll(stopTestDb);
beforeEach(async () => {
  ({ today } = await setUpShelf());
});

describe('orders: access', () => {
  it('is for signed-in customers only', async () => {
    expect((await request(app).post('/api/orders').send(base())).status).toBe(401);
    expect((await request(app).get('/api/orders')).status).toBe(401);
    expect((await place({}, farmerToken)).status).toBe(403);
    expect((await get('', farmerToken)).status).toBe(403);
  });
});

describe('POST /api/orders', () => {
  it('places the order and shows the customer their delivery code', async () => {
    const res = await place();
    expect(res.status).toBe(201);

    const { order } = res.body;
    expect(order).toMatchObject({
      status: 'placed',
      customer: String(customer._id),
      phone: '+8801712345678',
      zoneCode: 'dhaka-mirpur',
      totalBdt: 376,
    });
    expect(order.code).toMatch(/^ORD-[A-HJ-NP-Z2-9]{8}$/);
    expect(order.deliveryOtp).toMatch(/^\d{6}$/);
    expect(order.otpSalt).toBeUndefined();
    expect((await Lot.findOne({ code: 'LOT-AAAAAAAA' })).remainingKg).toBe(97);
  });

  it('ignores status, totals, owner and prices sent by the client', async () => {
    const [item] = base().items;
    const res = await place({
      status: 'delivered',
      totalBdt: 1,
      subtotalBdt: 1,
      customer: '65f1c2a4b9d3e8a1c4f7b999',
      items: [{ ...item, unitPriceBdt: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({
      status: 'placed',
      totalBdt: 376,
      customer: String(customer._id),
    });
  });

  it.each([
    ['no boxes', { items: [] }],
    ['a quantity of zero', { items: [{ boxCode: 'dhaka-family-x', qty: 0, seenUnitPriceBdt: 1 }] }],
    ['a bad phone number', { phone: '123' }],
    ['a bad delivery area code', { zoneCode: 'BAD ZONE' }],
    ['a too-short address', { address: { line: 'x' } }],
    ['an unsupported payment method', { paymentMethod: 'bkash' }],
  ])('rejects %s', async (_label, change) => {
    const res = await place(change);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('rejects the same box twice', async () => {
    const [item] = base().items;
    expect((await place({ items: [item, { ...item, qty: 1 }] })).status).toBe(400);
  });

  it('explains when the price has changed', async () => {
    const [item] = base().items;
    const stale = await place({ items: [{ ...item, seenUnitPriceBdt: 100 }] });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('price_changed');
    expect(stale.body.error.details.currentPriceBdt).toBe(168);
  });

  it('explains when there is not enough stock', async () => {
    const [item] = base().items;
    await Lot.updateOne({ code: 'LOT-AAAAAAAA' }, { remainingKg: 3 }); // 2 family boxes left
    const res = await place({ items: [{ ...item, qty: 3 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('insufficient_stock');
    expect(res.body.error.details.produceSlug).toBe('tomato');
  });
});

describe('GET /api/orders', () => {
  it('lists only your own orders, newest first, without delivery codes', async () => {
    const first = await place();
    const second = await place({ phone: '01812345678' });
    await place({}, otherToken);

    const res = await get('');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.orders.map((o) => o.code)).toEqual([
      second.body.order.code,
      first.body.order.code,
    ]);
    expect(res.body.orders[0]).not.toHaveProperty('deliveryOtp');
  });

  it('filters by status and paginates', async () => {
    const one = await place();
    await place();
    await Order.updateOne(
      { code: one.body.order.code },
      { status: 'cancelled', cancelledAt: new Date() },
    );

    expect((await get('?status=cancelled')).body.total).toBe(1);
    expect((await get('?status=placed')).body.total).toBe(1);
    const page = (await get('?limit=1&page=2')).body;
    expect(page).toMatchObject({ page: 2, limit: 1, total: 2 });
    expect(page.orders).toHaveLength(1);
    expect((await get('?status=lost')).status).toBe(400);
  });
});

describe('GET /api/orders/:code', () => {
  it('shows your order with the same delivery code every time', async () => {
    const { order } = (await place()).body;
    const a = await get(`/${order.code}`);
    const b = await get(`/${order.code}`);

    expect(a.status).toBe(200);
    expect(a.body.order.deliveryOtp).toBe(order.deliveryOtp);
    expect(b.body.order.deliveryOtp).toBe(order.deliveryOtp);

    const stored = await Order.findOne({ code: order.code }).select('+otpSalt');
    expect(order.deliveryOtp).toBe(deriveOtp(env.JWT_SECRET, order.code, stored.otpSalt));
  });

  it('stops showing the code once the order is delivered', async () => {
    const { order } = (await place()).body;
    await Order.updateOne({ code: order.code }, { status: 'delivered', deliveredAt: new Date() });
    expect((await get(`/${order.code}`)).body.order.deliveryOtp).toBeNull();
  });

  it("treats another customer's order as not found", async () => {
    const { order } = (await place()).body;
    const res = await get(`/${order.code}`, otherToken);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('order_not_found');
  });

  it('returns 404 for an unknown code and 400 for a malformed one', async () => {
    expect((await get('/ORD-AAAAAAAA')).status).toBe(404);
    expect((await get('/BAD-CODE')).status).toBe(400);
  });
});

describe('orders: allowance', () => {
  it('limits how many orders one customer can place per hour', async () => {
    const mini = express();
    mini.use(express.json());
    mini.use(
      '/orders',
      createOrdersRouter({ tokens, otpSecret: env.JWT_SECRET, perUserPerHour: 1 }),
    );
    mini.use(errorHandler({ error() {} }));
    const call = () => request(mini).post('/orders').set(as(customerToken)).send(base());

    expect((await call()).status).toBe(201);
    const second = await call();
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('rate_limited');
  });
});
