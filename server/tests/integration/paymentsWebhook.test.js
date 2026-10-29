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
import { createTokenService } from '../../src/services/tokenService.js';
import { createUser } from '../../src/services/userService.js';
import { signPayload } from '../../src/utils/signature.js';

const env = makeTestEnv();
const SECRET = env.PAYMENT_WEBHOOK_SECRET;
const tokens = createTokenService(env);
const sandbox = createSandboxProvider({ webhookSecret: SECRET });
const refund = vi.fn(sandbox.refund);
const provider = { ...sandbox, refund };
const app = makeTestApp({}, { payments: provider });

let today;
let token;
let otherToken;

const as = (t) => ({ Authorization: `Bearer ${t}` });
const placeWallet = async () => {
  const res = await request(app)
    .post('/api/orders')
    .set(as(token))
    .send({
      recipientName: 'Rahim Uddin',
      phone: '01712345678',
      zoneCode: 'dhaka-mirpur',
      address: { line: 'House 12, Road 3, Mirpur 10' },
      paymentMethod: 'wallet',
      items: [{ boxCode: `dhaka-family-${today}`, qty: 2, seenUnitPriceBdt: 168 }],
    });
  const order = res.body.order;
  const { providerRef } = await Payment.findOne({ orderCode: order.code });
  return { order, providerRef };
};
const eventFor = ({ order, providerRef }, outcome, overrides = {}) =>
  provider.buildEvent({
    providerRef,
    orderCode: order.code,
    amountBdt: order.totalBdt,
    outcome,
    ...overrides,
  });
const post = (rawBody, headers) =>
  request(app)
    .post('/api/payments/webhook')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(rawBody);
const send = (event) => post(event.rawBody, event.headers);
const paymentOf = (orderCode) => Payment.findOne({ orderCode });
const orderOf = (code) => Order.findOne({ code });
const remaining = async (code) => (await Lot.findOne({ code })).remainingKg;
const signedHeaders = (raw, secret = SECRET) => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'x-haatly-timestamp': timestamp,
    'x-haatly-signature': signPayload(secret, timestamp, raw),
  };
};

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
  token = tokens.sign(await createUser(person(1)));
  otherToken = tokens.sign(await createUser(person(2)));
});
afterAll(stopTestDb);
beforeEach(async () => {
  ({ today } = await setUpShelf());
  refund.mockClear();
});

describe('POST /api/payments/webhook: success', () => {
  it('confirms the payment, marks the order paid and unlocks the delivery code', async () => {
    const placed = await placeWallet();
    const res = await send(eventFor(placed, 'succeeded'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, outcome: 'paid' });

    expect((await paymentOf(placed.order.code)).status).toBe('succeeded');
    expect((await orderOf(placed.order.code)).paymentStatus).toBe('paid');

    const detail = await request(app).get(`/api/orders/${placed.order.code}`).set(as(token));
    expect(detail.body.order.deliveryOtp).toMatch(/^\d{6}$/);
  });

  it('treats a repeated event as a harmless duplicate', async () => {
    const placed = await placeWallet();
    const event = eventFor(placed, 'succeeded');
    await send(event);
    const again = await send(event);

    expect(again.status).toBe(200);
    expect(again.body.outcome).toBe('duplicate');
    expect((await paymentOf(placed.order.code)).history).toHaveLength(2);
  });

  it('accepts a payment that arrives after the window but before the cleanup job runs', async () => {
    const placed = await placeWallet();
    await Payment.updateOne(
      { orderCode: placed.order.code },
      { expiresAt: new Date(Date.now() - 1000) },
    );
    const res = await send(eventFor(placed, 'succeeded'));
    expect(res.body.outcome).toBe('paid');
    expect((await orderOf(placed.order.code)).status).toBe('placed');
  });
});

describe('POST /api/payments/webhook: trust', () => {
  it('rejects a missing, wrong or forged signature and changes nothing', async () => {
    const placed = await placeWallet();
    const event = eventFor(placed, 'succeeded');

    expect((await post(event.rawBody, {})).status).toBe(401);
    expect(
      (await post(event.rawBody, { ...event.headers, 'x-haatly-signature': 'a'.repeat(64) }))
        .status,
    ).toBe(401);
    expect((await post(event.rawBody.replace('376', '1'), event.headers)).status).toBe(401);

    const otherSecret = 'another-secret-another-secret-12345678';
    expect((await post(event.rawBody, signedHeaders(event.rawBody, otherSecret))).status).toBe(401);
    expect((await paymentOf(placed.order.code)).status).toBe('pending');
  });

  it('rejects an old, replayed request even though its signature is valid', async () => {
    const placed = await placeWallet();
    const stale = createSandboxProvider({
      webhookSecret: SECRET,
      clock: () => new Date(Date.now() - 10 * 60 * 1000),
    });
    const event = stale.buildEvent({
      providerRef: placed.providerRef,
      orderCode: placed.order.code,
      amountBdt: placed.order.totalBdt,
      outcome: 'succeeded',
    });
    expect((await send(event)).status).toBe(401);
    expect((await paymentOf(placed.order.code)).status).toBe('pending');
  });

  it('rejects an unknown payment, a wrong amount and a wrong order', async () => {
    const placed = await placeWallet();
    const unknown = await send(eventFor(placed, 'succeeded', { providerRef: 'SBX-ZZZZZZZZZZZZ' }));
    expect(unknown.status).toBe(404);

    const wrongAmount = await send(eventFor(placed, 'succeeded', { amountBdt: 1 }));
    expect(wrongAmount.status).toBe(400);
    expect(wrongAmount.body.error.code).toBe('payment_mismatch');

    const wrongOrder = await send(eventFor(placed, 'succeeded', { orderCode: 'ORD-AAAAAAAA' }));
    expect(wrongOrder.body.error.code).toBe('payment_mismatch');
    expect((await paymentOf(placed.order.code)).status).toBe('pending');
  });

  it('rejects a signed body that is not valid JSON or not a payment event', async () => {
    const notJson = await post('not json', signedHeaders('not json'));
    expect(notJson.status).toBe(400);
    expect(notJson.body.error.code).toBe('invalid_json');

    const empty = await post('{}', signedHeaders('{}'));
    expect(empty.body.error.code).toBe('invalid_event');
  });
});

describe('POST /api/payments/webhook: failure and late events', () => {
  it('cancels the order and frees the stock when the payment fails', async () => {
    const placed = await placeWallet();
    const event = eventFor(placed, 'failed');
    const res = await send(event);
    expect(res.body.outcome).toBe('failed');

    expect((await paymentOf(placed.order.code)).status).toBe('failed');
    expect(await orderOf(placed.order.code)).toMatchObject({
      status: 'cancelled',
      cancelReason: 'payment_failed',
    });
    expect(await remaining('LOT-AAAAAAAA')).toBe(100);
    expect((await send(event)).body.outcome).toBe('ignored');
  });

  it('never lets a failure event undo a payment that already succeeded', async () => {
    const placed = await placeWallet();
    await send(eventFor(placed, 'succeeded'));
    const res = await send(eventFor(placed, 'failed'));
    expect(res.body.outcome).toBe('ignored');
    expect((await paymentOf(placed.order.code)).status).toBe('succeeded');
    expect((await orderOf(placed.order.code)).status).toBe('placed');
  });

  it('refunds money that arrives after the order was cancelled, and only once', async () => {
    const placed = await placeWallet();
    await request(app).post(`/api/orders/${placed.order.code}/cancel`).set(as(token));

    const event = eventFor(placed, 'succeeded');
    const first = await send(event);
    expect(first.body.outcome).toBe('refunded_late');
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        amountBdt: 376,
        idempotencyKey: expect.stringMatching(/^late-PAY-/),
      }),
    );

    const payment = await paymentOf(placed.order.code);
    expect(payment.status).toBe('cancelled');
    expect(payment.history.at(-1).note).toMatch(/^late payment refunded RFN-/);

    expect((await send(event)).body.outcome).toBe('duplicate');
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it('ends in one consistent state when success and failure arrive together', async () => {
    const placed = await placeWallet();
    await Promise.all([send(eventFor(placed, 'succeeded')), send(eventFor(placed, 'failed'))]);

    const payment = await paymentOf(placed.order.code);
    const order = await orderOf(placed.order.code);
    if (payment.status === 'succeeded') {
      expect(order).toMatchObject({ status: 'placed', paymentStatus: 'paid' });
      expect(refund).not.toHaveBeenCalled();
    } else {
      expect(payment.status).toBe('failed');
      expect(order.status).toBe('cancelled');
      expect(refund).toHaveBeenCalledTimes(1); // the success arrived late, so it was refunded
    }
  });
});

describe('POST /api/payments/sandbox/complete', () => {
  const complete = (t, body) =>
    request(app).post('/api/payments/sandbox/complete').set(as(t)).send(body);

  it('lets a customer pay their own sandbox payment', async () => {
    const placed = await placeWallet();
    const res = await complete(token, { providerRef: placed.providerRef, outcome: 'succeeded' });
    expect(res.status).toBe(200);
    expect(res.body.result.outcome).toBe('paid');
    expect((await orderOf(placed.order.code)).paymentStatus).toBe('paid');
  });

  it('can simulate a failed payment', async () => {
    const placed = await placeWallet();
    const res = await complete(token, { providerRef: placed.providerRef, outcome: 'failed' });
    expect(res.body.result.outcome).toBe('failed');
    expect((await orderOf(placed.order.code)).status).toBe('cancelled');
  });

  it("will not touch another customer's payment, and needs a login", async () => {
    const placed = await placeWallet();
    const body = { providerRef: placed.providerRef, outcome: 'succeeded' };
    expect((await complete(otherToken, body)).status).toBe(404);
    expect((await request(app).post('/api/payments/sandbox/complete').send(body)).status).toBe(401);
    expect((await paymentOf(placed.order.code)).status).toBe('pending');
  });

  it('does not exist when no sandbox provider is configured', async () => {
    const off = makeTestApp({ PAYMENT_PROVIDER: 'none' });
    const res = await request(off)
      .post('/api/payments/sandbox/complete')
      .set(as(token))
      .send({ providerRef: 'SBX-ABCDEFGHJKLM', outcome: 'succeeded' });
    expect(res.status).toBe(404);
  });
});
