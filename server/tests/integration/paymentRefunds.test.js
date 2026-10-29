import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { Lot } from '../../src/models/Lot.js';
import { Order } from '../../src/models/Order.js';
import { Payment } from '../../src/models/Payment.js';
import { User } from '../../src/models/User.js';
import { createSandboxProvider } from '../../src/services/payments/sandbox.js';
import { settleCashPayment } from '../../src/services/payments/settle.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { createUser } from '../../src/services/userService.js';

const env = makeTestEnv();
const tokens = createTokenService(env);
const sandbox = createSandboxProvider({ webhookSecret: env.PAYMENT_WEBHOOK_SECRET });
const refund = vi.fn(sandbox.refund);
const app = makeTestApp({}, { payments: { ...sandbox, refund } });

let today;
let token;

const as = () => ({ Authorization: `Bearer ${token}` });
const place = async (testApp, paymentMethod) => {
  const res = await request(testApp)
    .post('/api/orders')
    .set(as())
    .send({
      recipientName: 'Rahim Uddin',
      phone: '01712345678',
      zoneCode: 'dhaka-mirpur',
      address: { line: 'House 12, Road 3, Mirpur 10' },
      paymentMethod,
      items: [{ boxCode: `dhaka-family-${today}`, qty: 2, seenUnitPriceBdt: 168 }],
    });
  return res.body.order;
};
const cancel = (testApp, code) => request(testApp).post(`/api/orders/${code}/cancel`).set(as());
const paymentOf = (orderCode) => Payment.findOne({ orderCode });
const remaining = async (code) => (await Lot.findOne({ code })).remainingKg;
const markPaid = async (orderCode) => {
  await Payment.updateOne({ orderCode }, { status: 'succeeded' });
  await Order.updateOne({ code: orderCode }, { paymentStatus: 'paid' });
};

beforeAll(async () => {
  await startTestDb();
  await User.init();
  token = tokens.sign(
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
  refund.mockClear();
});

describe('cancelling and payments', () => {
  it('cancels the pending cash payment of a cancelled order', async () => {
    const order = await place(app, 'cod');
    expect((await cancel(app, order.code)).status).toBe(200);

    const payment = await paymentOf(order.code);
    expect(payment.status).toBe('cancelled');
    expect(payment.history.map((h) => h.status)).toEqual(['pending', 'cancelled']);
    expect(refund).not.toHaveBeenCalled();
  });

  it('cancels an unpaid wallet payment and frees the stock', async () => {
    const order = await place(app, 'wallet');
    await cancel(app, order.code);

    expect((await paymentOf(order.code)).status).toBe('cancelled');
    expect(await remaining('LOT-AAAAAAAA')).toBe(100);
    expect(refund).not.toHaveBeenCalled();
  });

  it('refunds a paid wallet order in full when it is cancelled', async () => {
    const order = await place(app, 'wallet');
    await markPaid(order.code);

    const res = await cancel(app, order.code);
    expect(res.status).toBe(200);
    expect(res.body.order).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded' });

    const payment = await paymentOf(order.code);
    expect(payment).toMatchObject({ status: 'refunded', refundedBdt: 376 });
    expect(payment.history.at(-1).note).toMatch(/^refund RFN-/);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledWith({
      providerRef: payment.providerRef,
      amountBdt: 376,
      idempotencyKey: payment.code,
    });
    expect(await remaining('LOT-AAAAAAAA')).toBe(100);
  });

  it('refunds only once, even for two simultaneous cancels', async () => {
    const order = await place(app, 'wallet');
    await markPaid(order.code);

    const results = await Promise.all([cancel(app, order.code), cancel(app, order.code)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(refund).toHaveBeenCalledTimes(1);
    expect((await paymentOf(order.code)).status).toBe('refunded');
  });

  it('still cancels the order when the gateway cannot refund, leaving the refund for later', async () => {
    const broken = makeTestApp(
      {},
      { payments: { ...sandbox, refund: vi.fn().mockRejectedValue(new Error('gateway down')) } },
    );
    const order = await place(broken, 'wallet');
    await markPaid(order.code);

    const res = await cancel(broken, order.code);
    expect(res.status).toBe(200);
    expect(res.body.order).toMatchObject({ status: 'cancelled', paymentStatus: 'paid' });
    expect((await paymentOf(order.code)).status).toBe('succeeded');
    expect(await remaining('LOT-AAAAAAAA')).toBe(100);
  });
});

describe('settleCashPayment', () => {
  const deliver = (code) =>
    Order.updateOne({ code }, { status: 'delivered', deliveredAt: new Date() });

  it('marks the cash payment and the order as paid once delivered', async () => {
    const order = await place(app, 'cod');
    await deliver(order.code);

    const payment = await settleCashPayment({ orderCode: order.code });
    expect(payment.status).toBe('succeeded');
    expect(payment.history.at(-1).note).toBe('cash collected');
    expect((await Order.findOne({ code: order.code })).paymentStatus).toBe('paid');
  });

  it('is safe to call twice', async () => {
    const order = await place(app, 'cod');
    await deliver(order.code);
    await settleCashPayment({ orderCode: order.code });
    const again = await settleCashPayment({ orderCode: order.code });
    expect(again.status).toBe('succeeded');
    expect((await paymentOf(order.code)).history).toHaveLength(2);
  });

  it('refuses an order that has not been delivered', async () => {
    const order = await place(app, 'cod');
    await expect(settleCashPayment({ orderCode: order.code })).rejects.toMatchObject({
      status: 409,
      code: 'order_not_delivered',
    });
  });

  it('refuses wallet orders and unknown orders', async () => {
    const order = await place(app, 'wallet');
    await deliver(order.code);
    await expect(settleCashPayment({ orderCode: order.code })).rejects.toMatchObject({
      code: 'not_cash_order',
    });
    await expect(settleCashPayment({ orderCode: 'ORD-AAAAAAAA' })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('refuses a cancelled payment', async () => {
    const order = await place(app, 'cod');
    await Payment.updateOne({ orderCode: order.code }, { status: 'cancelled' });
    await deliver(order.code);
    await expect(settleCashPayment({ orderCode: order.code })).rejects.toMatchObject({
      code: 'payment_not_settleable',
    });
  });
});
