import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { Lot } from '../../src/models/Lot.js';
import { Order } from '../../src/models/Order.js';
import { Payment } from '../../src/models/Payment.js';
import { User } from '../../src/models/User.js';
import {
  expireUnpaidOrders,
  retryRefunds,
  runPaymentMaintenance,
} from '../../src/services/payments/maintenance.js';
import { createSandboxProvider } from '../../src/services/payments/sandbox.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { createUser } from '../../src/services/userService.js';

const env = makeTestEnv();
const tokens = createTokenService(env);
const sandbox = createSandboxProvider({ webhookSecret: env.PAYMENT_WEBHOOK_SECRET });
const refund = vi.fn(sandbox.refund);
const provider = { ...sandbox, refund };
const app = makeTestApp({}, { payments: provider });

let today;
let token;

const as = () => ({ Authorization: `Bearer ${token}` });
const place = async (paymentMethod = 'wallet') => {
  const res = await request(app)
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
const payOnline = async (orderCode, outcome = 'succeeded') => {
  const { providerRef } = await Payment.findOne({ orderCode });
  return request(app)
    .post('/api/payments/sandbox/complete')
    .set(as())
    .send({ providerRef, outcome });
};
const makeOverdue = (orderCode) =>
  Payment.updateOne({ orderCode }, { expiresAt: new Date(Date.now() - 60 * 1000) });
const paymentOf = (orderCode) => Payment.findOne({ orderCode });
const orderOf = (code) => Order.findOne({ code });
const remaining = async (code) => (await Lot.findOne({ code })).remainingKg;

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

describe('expireUnpaidOrders', () => {
  it('cancels an unpaid wallet order past its window and frees the stock', async () => {
    const order = await place();
    await makeOverdue(order.code);

    expect(await expireUnpaidOrders()).toBe(1);
    expect((await paymentOf(order.code)).status).toBe('cancelled');
    expect(await orderOf(order.code)).toMatchObject({
      status: 'cancelled',
      cancelReason: 'payment_expired',
    });
    expect(await remaining('LOT-AAAAAAAA')).toBe(100);
  });

  it('leaves alone orders still inside their window, cash orders and paid orders', async () => {
    const waiting = await place();
    const cash = await place('cod');
    const paid = await place();
    await payOnline(paid.code);
    await makeOverdue(paid.code);

    expect(await expireUnpaidOrders()).toBe(0);
    expect((await orderOf(waiting.code)).status).toBe('placed');
    expect((await orderOf(cash.code)).status).toBe('placed');
    expect((await orderOf(paid.code)).status).toBe('placed');
  });

  it('is safe to run twice', async () => {
    const order = await place();
    await makeOverdue(order.code);
    expect(await expireUnpaidOrders()).toBe(1);
    expect(await expireUnpaidOrders()).toBe(0);
    expect(await remaining('LOT-AAAAAAAA')).toBe(100);
  });

  it('ends in one consistent state when payment and expiry happen together', async () => {
    const order = await place();
    await makeOverdue(order.code);
    await Promise.all([payOnline(order.code), expireUnpaidOrders()]);

    const payment = await paymentOf(order.code);
    const saved = await orderOf(order.code);
    if (payment.status === 'succeeded') {
      expect(saved).toMatchObject({ status: 'placed', paymentStatus: 'paid' });
      expect(await remaining('LOT-AAAAAAAA')).toBe(97);
    } else {
      expect(saved.status).toBe('cancelled');
      expect(await remaining('LOT-AAAAAAAA')).toBe(100);
      expect(refund).toHaveBeenCalledTimes(1); // the payment arrived late, so it was refunded
    }
  });
});

describe('retryRefunds', () => {
  async function paidThenCancelledWhileGatewayDown() {
    const down = makeTestApp(
      {},
      { payments: { ...sandbox, refund: vi.fn().mockRejectedValue(new Error('gateway down')) } },
    );
    const order = await place();
    await payOnline(order.code);
    await request(down).post(`/api/orders/${order.code}/cancel`).set(as());
    return order;
  }

  it('finishes a refund that failed when the order was cancelled', async () => {
    const order = await paidThenCancelledWhileGatewayDown();
    expect((await paymentOf(order.code)).status).toBe('succeeded');

    expect(await retryRefunds({ provider })).toEqual({ retried: 1, refunded: 1 });
    expect(await paymentOf(order.code)).toMatchObject({ status: 'refunded', refundedBdt: 376 });
    expect((await orderOf(order.code)).paymentStatus).toBe('refunded');
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it('does nothing the second time', async () => {
    await paidThenCancelledWhileGatewayDown();
    await retryRefunds({ provider });
    expect(await retryRefunds({ provider })).toEqual({ retried: 0, refunded: 0 });
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it('keeps trying later when the gateway is still down', async () => {
    const order = await paidThenCancelledWhileGatewayDown();
    const stillDown = { ...sandbox, refund: vi.fn().mockRejectedValue(new Error('down')) };
    expect(await retryRefunds({ provider: stillDown })).toEqual({ retried: 1, refunded: 0 });
    expect((await paymentOf(order.code)).status).toBe('succeeded');
  });

  it('does nothing without a provider, and ignores orders that were never paid', async () => {
    await place();
    expect(await retryRefunds({ provider: null })).toEqual({ retried: 0, refunded: 0 });
    expect(await retryRefunds({ provider })).toEqual({ retried: 0, refunded: 0 });
  });
});

describe('runPaymentMaintenance', () => {
  it('expires unpaid orders and retries stuck refunds in one pass', async () => {
    const order = await place();
    await makeOverdue(order.code);
    expect(await runPaymentMaintenance({ provider })).toEqual({
      expired: 1,
      retried: 0,
      refunded: 0,
    });
  });
});
