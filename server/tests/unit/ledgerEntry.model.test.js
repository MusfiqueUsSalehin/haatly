import { describe, expect, it } from 'vitest';
import { LedgerEntry } from '../../src/models/LedgerEntry.js';
import { errorsOf } from '../helpers/errorsOf.js';

const base = {
  farmer: '65f1c2a4b9d3e8a1c4f7b001',
  orderCode: 'ORD-ABCD2345',
  lotCode: 'LOT-AAAAAAAA',
  produceSlug: 'tomato',
  kg: 3,
  pricePerKgBdt: 56,
  floorBdt: 28,
  revenueBdt: 168,
  farmerBdt: 120.96,
  platformBdt: 47.04,
  deliveredAt: new Date('2026-10-20T06:00:00Z'),
};
const check = (overrides) => errorsOf(new LedgerEntry({ ...base, ...overrides }));

describe('LedgerEntry', () => {
  it('accepts a valid entry, starting unpaid', async () => {
    const entry = new LedgerEntry(base);
    expect(await errorsOf(entry)).toEqual({});
    expect(entry.status).toBe('unpaid');
  });

  it('rejects a payout below the guaranteed floor', async () => {
    // 3 kg at a floor of 28 is 84 taka at the very least.
    expect(await check({ farmerBdt: 80, platformBdt: 88 })).toHaveProperty('farmerBdt');
    expect(await check({ farmerBdt: 84, platformBdt: 84 })).toEqual({});
  });

  it('accepts a floor top-up, where the platform side is negative', async () => {
    const topUp = { kg: 10, pricePerKgBdt: 20, revenueBdt: 200, farmerBdt: 280, platformBdt: -80 };
    expect(await check(topUp)).toEqual({});
  });

  it('rejects money that does not add up', async () => {
    expect(await check({ platformBdt: 10 })).toHaveProperty('platformBdt');
  });

  it('needs a payout reference and time for a paid entry, and forbids them otherwise', async () => {
    const paid = { status: 'paid' };
    const missing = await check(paid);
    expect(missing).toHaveProperty('paidAt');
    expect(missing).toHaveProperty('payoutRef');
    expect(await check({ ...paid, paidAt: new Date(), payoutRef: 'BKASH-123' })).toEqual({});

    expect(await check({ payoutRef: 'BKASH-123' })).toHaveProperty('payoutRef');
    expect(await check({ paidAt: new Date() })).toHaveProperty('paidAt');
  });

  it('rejects bad codes, kilos, prices and statuses', async () => {
    expect(await check({ orderCode: 'ORD-bad' })).toHaveProperty('orderCode');
    expect(await check({ lotCode: 'LOT-bad' })).toHaveProperty('lotCode');
    expect(await check({ kg: 0 })).toHaveProperty('kg');
    expect(await check({ pricePerKgBdt: 0 })).toHaveProperty('pricePerKgBdt');
    expect(await check({ status: 'lost' })).toHaveProperty('status');
    expect(await check({ farmer: undefined })).toHaveProperty('farmer');
  });

  it('allows only one entry per lot per order', () => {
    const index = LedgerEntry.schema
      .indexes()
      .find(([fields]) => fields.orderCode === 1 && fields.lotCode === 1);
    expect(index[1]).toMatchObject({ unique: true });
  });

  it('hides mongo internals in JSON', () => {
    const json = new LedgerEntry(base).toJSON();
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.lotCode).toBe('LOT-AAAAAAAA');
  });
});
