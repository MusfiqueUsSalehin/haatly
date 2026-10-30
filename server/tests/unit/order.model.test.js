import { describe, expect, it } from 'vitest';
import { Order } from '../../src/models/Order.js';
import { orderTotals } from '../../src/services/orders/orderPolicy.js';
import { errorsOf } from '../helpers/errorsOf.js';

const makeItem = (boxCode = 'dhaka-family-2026-10-17') => ({
  boxCode,
  tier: 'family',
  qty: 2,
  unitPriceBdt: 168,
  lines: [
    { produceSlug: 'tomato', kgPerBox: 1.5 },
    { produceSlug: 'cabbage', kgPerBox: 1.5 },
  ],
  allocations: [
    { lotCode: 'LOT-AAAAAAAA', produceSlug: 'tomato', kg: 3, pricePerKgBdt: 56 },
    { lotCode: 'LOT-DDDDDDDD', produceSlug: 'cabbage', kg: 3, pricePerKgBdt: 40 },
  ],
});

const build = (items = [makeItem()], overrides = {}) => ({
  code: 'ORD-ABCD2345',
  customer: '65f1c2a4b9d3e8a1c4f7b001',
  recipientName: 'Rahim Uddin',
  phone: '+8801712345678',
  cityCode: 'dhaka',
  zoneCode: 'dhaka-mirpur',
  address: { line: 'House 12, Road 3, Mirpur 10', landmark: 'Near the mosque' },
  items,
  ...orderTotals(items),
  paymentMethod: 'cod',
  otpSalt: 'salt',
  ...overrides,
});

describe('Order', () => {
  it('accepts a valid order', async () => {
    expect(await errorsOf(new Order(build()))).toEqual({});
  });

  it('starts placed, unpaid and with no failed delivery attempts', () => {
    const order = new Order(build());
    expect(order.status).toBe('placed');
    expect(order.paymentStatus).toBe('unpaid');
    expect(order.otpAttempts).toBe(0);
  });

  it('rejects allocations that do not cover the box', async () => {
    const short = makeItem();
    short.allocations[0].kg = 2.5;
    expect(await errorsOf(new Order(build([short])))).toHaveProperty('items');
  });

  it('rejects an allocation for produce that is not in the box', async () => {
    const extra = makeItem();
    extra.allocations.push({
      lotCode: 'LOT-ZZZZZZZZ',
      produceSlug: 'okra',
      kg: 1,
      pricePerKgBdt: 60,
    });
    expect(await errorsOf(new Order(build([extra])))).toHaveProperty('items');
  });

  it('rejects totals that do not add up', async () => {
    expect(await errorsOf(new Order(build([makeItem()], { totalBdt: 999 })))).toHaveProperty(
      'totalBdt',
    );
    expect(await errorsOf(new Order(build([makeItem()], { subtotalBdt: 1 })))).toHaveProperty(
      'subtotalBdt',
    );
  });

  it('rejects a quantity of zero or more than ten', async () => {
    for (const qty of [0, 11]) {
      const order = new Order(build([{ ...makeItem(), qty }]));
      // The order as a whole is rejected...
      expect(Object.keys(await errorsOf(order))).not.toEqual([]);
      // ...and the box itself names the quantity as the problem.
      expect(await errorsOf(order.items[0])).toHaveProperty('qty');
    }
  });

  it('rejects an order with no boxes', async () => {
    expect(await errorsOf(new Order(build([])))).toHaveProperty('items');
  });

  it('rejects the same box twice and more than five boxes', async () => {
    expect(await errorsOf(new Order(build([makeItem(), makeItem()])))).toHaveProperty('items');
    const six = Array.from({ length: 6 }, (_, n) => makeItem(`dhaka-family-2026-10-1${n}`));
    expect(await errorsOf(new Order(build(six)))).toHaveProperty('items');
  });

  it('rejects a zone that belongs to another city', async () => {
    const wrong = build([makeItem()], { zoneCode: 'chattogram-gec' });
    expect(await errorsOf(new Order(wrong))).toHaveProperty('zoneCode');
  });

  it('needs a time for cancelled and delivered orders', async () => {
    expect(await errorsOf(new Order(build([makeItem()], { status: 'cancelled' })))).toHaveProperty(
      'cancelledAt',
    );
    expect(await errorsOf(new Order(build([makeItem()], { status: 'delivered' })))).toHaveProperty(
      'deliveredAt',
    );
    const done = build([makeItem()], { status: 'cancelled', cancelledAt: new Date() });
    expect(await errorsOf(new Order(done))).toEqual({});
  });

  it('rejects an unknown status and a non-Bangladesh phone number', async () => {
    expect(await errorsOf(new Order(build([makeItem()], { status: 'lost' })))).toHaveProperty(
      'status',
    );
    const foreign = build([makeItem()], { phone: '+14155550123' });
    expect(await errorsOf(new Order(foreign))).toHaveProperty('phone');
  });

  it('requires the one-time code salt', async () => {
    const { otpSalt: _salt, ...withoutSalt } = build();
    expect(await errorsOf(new Order(withoutSalt))).toHaveProperty('otpSalt');
  });

  it('never shows the salt or mongo internals in JSON', () => {
    const json = new Order(build()).toJSON();
    expect(json.otpSalt).toBeUndefined();
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.code).toBe('ORD-ABCD2345');
  });

  it('never shows which delivery run an order is in', () => {
    const json = new Order(build([makeItem()], { runCode: 'RUN-ABCD2345' })).toJSON();
    expect(json.runCode).toBeUndefined();
    expect(json.otpSalt).toBeUndefined();
  });
});
