import { describe, expect, it } from 'vitest';
import { PAYMENT_STATUS_LIST, canMovePayment } from '../../src/constants/payments.js';
import { Payment } from '../../src/models/Payment.js';
import { errorsOf } from '../helpers/errorsOf.js';

const cod = {
  code: 'PAY-ABCD2345',
  orderCode: 'ORD-ABCD2345',
  customer: '65f1c2a4b9d3e8a1c4f7b001',
  method: 'cod',
  provider: 'cod',
  amountBdt: 376,
};
const wallet = {
  ...cod,
  code: 'PAY-ABCD2346',
  method: 'wallet',
  provider: 'sandbox',
  expiresAt: new Date('2026-10-20T06:15:00Z'),
};

describe('Payment', () => {
  it('accepts valid cash and wallet payments, starting pending with nothing refunded', async () => {
    for (const data of [cod, wallet]) {
      const payment = new Payment(data);
      expect(await errorsOf(payment)).toEqual({});
      expect(payment.status).toBe('pending');
      expect(payment.refundedBdt).toBe(0);
    }
  });

  it('keeps cash on delivery free of provider details', async () => {
    expect(await errorsOf(new Payment({ ...cod, provider: 'sandbox' }))).toHaveProperty('provider');
    expect(await errorsOf(new Payment({ ...cod, providerRef: 'SBX-1' }))).toHaveProperty(
      'providerRef',
    );
    expect(await errorsOf(new Payment({ ...cod, expiresAt: new Date() }))).toHaveProperty(
      'expiresAt',
    );
  });

  it('needs a provider and a payment window for a wallet payment', async () => {
    expect(await errorsOf(new Payment({ ...wallet, provider: 'cod' }))).toHaveProperty('provider');
    expect(await errorsOf(new Payment({ ...wallet, expiresAt: undefined }))).toHaveProperty(
      'expiresAt',
    );
  });

  it('needs a provider reference once a wallet payment has succeeded', async () => {
    const paid = { ...wallet, status: 'succeeded' };
    expect(await errorsOf(new Payment(paid))).toHaveProperty('providerRef');
    expect(await errorsOf(new Payment({ ...paid, providerRef: 'SBX-ABCDEFGHJKLM' }))).toEqual({});
  });

  it('only accepts whole positive taka', async () => {
    for (const amountBdt of [0, -5, 12.5]) {
      expect(await errorsOf(new Payment({ ...cod, amountBdt }))).toHaveProperty('amountBdt');
    }
  });

  it('rejects bad codes, methods and statuses', async () => {
    expect(await errorsOf(new Payment({ ...cod, code: 'PAY-bad' }))).toHaveProperty('code');
    expect(await errorsOf(new Payment({ ...cod, orderCode: 'ORD-bad' }))).toHaveProperty(
      'orderCode',
    );
    expect(await errorsOf(new Payment({ ...cod, method: 'bitcoin' }))).toHaveProperty('method');
    expect(await errorsOf(new Payment({ ...cod, status: 'lost' }))).toHaveProperty('status');
  });

  it('only allows full refunds, and only on refunded payments', async () => {
    const refunded = { ...cod, status: 'refunded' };
    expect(await errorsOf(new Payment({ ...refunded, refundedBdt: 0 }))).toHaveProperty(
      'refundedBdt',
    );
    expect(await errorsOf(new Payment({ ...refunded, refundedBdt: 100 }))).toHaveProperty(
      'refundedBdt',
    );
    expect(await errorsOf(new Payment({ ...refunded, refundedBdt: 376 }))).toEqual({});
    expect(
      await errorsOf(new Payment({ ...cod, status: 'succeeded', refundedBdt: 100 })),
    ).toHaveProperty('refundedBdt');
  });

  it('hides mongo internals in JSON', () => {
    const json = new Payment(cod).toJSON();
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.code).toBe('PAY-ABCD2345');
  });

  it('has one payment per order and unique gateway references', () => {
    expect(Payment.schema.path('orderCode').options.unique).toBe(true);
    const unique = Payment.schema
      .indexes()
      .find(([fields]) => fields.providerRef === 1 && Object.keys(fields).length === 1);
    expect(unique[1]).toMatchObject({ unique: true, sparse: true });
  });
});

describe('payment state machine', () => {
  it('lets a pending payment succeed, fail or be cancelled', () => {
    for (const to of ['succeeded', 'failed', 'cancelled']) {
      expect(canMovePayment('pending', to)).toBe(true);
    }
  });

  it('lets only a successful payment be refunded', () => {
    expect(canMovePayment('succeeded', 'refunded')).toBe(true);
    expect(canMovePayment('pending', 'refunded')).toBe(false);
    expect(canMovePayment('failed', 'refunded')).toBe(false);
  });

  it('never moves backwards or out of a final state', () => {
    expect(canMovePayment('succeeded', 'pending')).toBe(false);
    expect(canMovePayment('succeeded', 'failed')).toBe(false);
    for (const from of ['failed', 'cancelled', 'refunded']) {
      for (const to of PAYMENT_STATUS_LIST) expect(canMovePayment(from, to)).toBe(false);
    }
  });

  it('treats an unknown status as a dead end', () => {
    expect(canMovePayment('mystery', 'succeeded')).toBe(false);
  });
});
