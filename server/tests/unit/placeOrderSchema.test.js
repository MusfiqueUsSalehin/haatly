import { describe, expect, it } from 'vitest';
import { placeOrderSchema } from '../../src/schemas/orders.js';

const item = { boxCode: 'dhaka-family-2026-10-17', qty: 2, seenUnitPriceBdt: 168 };
const valid = {
  recipientName: ' Rahim Uddin ',
  phone: '01712345678',
  zoneCode: 'dhaka-mirpur',
  address: { line: ' House 12, Road 3 ', landmark: ' Near the mosque ' },
  items: [item],
};
const ok = (change) => placeOrderSchema.safeParse({ ...valid, ...change }).success;

describe('placeOrderSchema', () => {
  it('cleans the input and defaults to cash on delivery', () => {
    const parsed = placeOrderSchema.parse(valid);
    expect(parsed).toMatchObject({
      recipientName: 'Rahim Uddin',
      phone: '+8801712345678',
      address: { line: 'House 12, Road 3', landmark: 'Near the mosque' },
      paymentMethod: 'cod',
    });
  });

  it('strips fields a client must not control', () => {
    const parsed = placeOrderSchema.parse({
      ...valid,
      status: 'delivered',
      totalBdt: 1,
      customer: 'someone',
      items: [{ ...item, unitPriceBdt: 1 }],
    });
    expect(parsed).not.toHaveProperty('status');
    expect(parsed).not.toHaveProperty('totalBdt');
    expect(parsed).not.toHaveProperty('customer');
    expect(parsed.items[0]).not.toHaveProperty('unitPriceBdt');
  });

  it('needs between one and five boxes', () => {
    expect(ok({ items: [] })).toBe(false);
    const six = Array.from({ length: 6 }, (_, n) => ({
      ...item,
      boxCode: `dhaka-mini-2026-10-1${n}`,
    }));
    expect(ok({ items: six })).toBe(false);
    expect(ok({ items: six.slice(0, 5) })).toBe(true);
  });

  it.each([0, 11, 2.5, '2'])('rejects a quantity of %s', (qty) => {
    expect(ok({ items: [{ ...item, qty }] })).toBe(false);
  });

  it('rejects the same box twice', () => {
    expect(ok({ items: [item, { ...item, qty: 1 }] })).toBe(false);
  });

  it('rejects bad prices, codes, phones, addresses and payment methods', () => {
    expect(ok({ items: [{ ...item, seenUnitPriceBdt: 0 }] })).toBe(false);
    expect(ok({ items: [{ ...item, boxCode: 'BAD CODE' }] })).toBe(false);
    expect(ok({ zoneCode: 'BAD ZONE' })).toBe(false);
    expect(ok({ phone: '123' })).toBe(false);
    expect(ok({ address: { line: 'x' } })).toBe(false);
    expect(ok({ paymentMethod: 'bkash' })).toBe(false);
  });
});
