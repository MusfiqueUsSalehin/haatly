import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { Lot } from '../../src/models/Lot.js';
import { Order } from '../../src/models/Order.js';
import { Payment } from '../../src/models/Payment.js';
import { User } from '../../src/models/User.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { createUser } from '../../src/services/userService.js';

const tokens = createTokenService(makeTestEnv());
const app = makeTestApp();

let today;
let customerToken;

const place = (testApp, paymentMethod) =>
  request(testApp)
    .post('/api/orders')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({
      recipientName: 'Rahim Uddin',
      phone: '01712345678',
      zoneCode: 'dhaka-mirpur',
      address: { line: 'House 12, Road 3, Mirpur 10' },
      paymentMethod,
      items: [{ boxCode: `dhaka-family-${today}`, qty: 2, seenUnitPriceBdt: 168 }],
    });
const remaining = async (code) => (await Lot.findOne({ code })).remainingKg;

beforeAll(async () => {
  await startTestDb();
  await User.init();
  customerToken = tokens.sign(
    await createUser({
      name: 'Person 1',
      email: 'person1@example.com',
      phone: '+8801712345678',
      password: 'a-strong-password',
      role: 'customer',
      status: 'active',
    }),
  );
});
afterAll(stopTestDb);
beforeEach(async () => {
  ({ today } = await setUpShelf());
});

describe('cash on delivery checkout', () => {
  it('records a pending cash payment for the total', async () => {
    const res = await place(app, 'cod');
    expect(res.status).toBe(201);
    expect(res.body.payment).toEqual({
      code: expect.stringMatching(/^PAY-[A-HJ-NP-Z2-9]{8}$/),
      method: 'cod',
      amountBdt: 376,
      status: 'pending',
      expiresAt: null,
    });
    expect(res.body.order).toMatchObject({ paymentMethod: 'cod', paymentStatus: 'unpaid' });
    expect(res.body.order.deliveryOtp).toMatch(/^\d{6}$/);

    const saved = await Payment.findOne({ orderCode: res.body.order.code });
    expect(saved).toMatchObject({ method: 'cod', provider: 'cod', amountBdt: 376 });
  });
});

describe('wallet checkout', () => {
  it('holds the stock, creates a charge and waits for payment', async () => {
    const res = await place(app, 'wallet');
    expect(res.status).toBe(201);

    const { order, payment } = res.body;
    expect(order).toMatchObject({
      paymentMethod: 'wallet',
      paymentStatus: 'unpaid',
      status: 'placed',
    });
    expect(payment).toMatchObject({ method: 'wallet', amountBdt: 376, status: 'pending' });
    expect(payment.payUrl).toMatch(/^\/sandbox\/pay\/SBX-/);

    const saved = await Payment.findOne({ orderCode: order.code });
    expect(saved).toMatchObject({ provider: 'sandbox', method: 'wallet' });
    expect(payment.payUrl).toContain(saved.providerRef);
    expect(await remaining('LOT-AAAAAAAA')).toBe(97);
  });

  it('keeps the delivery code hidden until the order is paid', async () => {
    const res = await place(app, 'wallet');
    expect(res.body.order.deliveryOtp).toBeNull();
    const detail = await request(app)
      .get(`/api/orders/${res.body.order.code}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(detail.body.order.deliveryOtp).toBeNull();
  });

  it('gives the customer the configured payment window', async () => {
    const res = await place(app, 'wallet');
    const ms = new Date(res.body.payment.expiresAt) - Date.now();
    expect(ms).toBeGreaterThan(14 * 60 * 1000);
    expect(ms).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it('creates exactly one payment per order', async () => {
    await place(app, 'wallet');
    await place(app, 'cod');
    expect(await Order.countDocuments()).toBe(2);
    expect(await Payment.countDocuments()).toBe(2);
  });

  it('refuses a wallet order when no wallet provider is configured', async () => {
    const off = makeTestApp({ PAYMENT_PROVIDER: 'none' });
    const res = await place(off, 'wallet');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('payment_unavailable');
    expect(await remaining('LOT-AAAAAAAA')).toBe(100);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('puts the stock back when the gateway fails', async () => {
    const failing = {
      name: 'sandbox',
      createCharge: async () => {
        throw new Error('gateway down');
      },
    };
    const res = await place(makeTestApp({}, { payments: failing }), 'wallet');
    expect(res.status).toBe(500);
    expect(await remaining('LOT-AAAAAAAA')).toBe(100);
    expect(await remaining('LOT-DDDDDDDD')).toBe(100);
    expect(await Order.countDocuments()).toBe(0);
    expect(await Payment.countDocuments()).toBe(0);
  });

  it('rejects an unknown payment method', async () => {
    expect((await place(app, 'bitcoin')).status).toBe(400);
  });
});
