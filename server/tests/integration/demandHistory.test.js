import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeUser, placeOrderFor } from '../helpers/deliveryFixture.js';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { Order } from '../../src/models/Order.js';
import { User } from '../../src/models/User.js';
import { cancelOrder } from '../../src/services/orders/cancelOrder.js';
import { demandByProduce } from '../../src/services/forecast/demand.js';

// 06:00 UTC on 20 October is noon on 20 October in Bangladesh.
const NOW = new Date('2026-10-20T06:00:00Z');
let today;
let customer;

// Every family-box order of 2 boxes is 3 kg of tomato and 3 kg of cabbage.
const order = async (createdAt, { zoneCode } = {}) => {
  const placed = await placeOrderFor(customer, today, { zoneCode });
  await Order.collection.updateOne(
    { code: placed.code },
    { $set: { createdAt: new Date(createdAt) } },
  );
  return placed;
};
const demand = (options) => demandByProduce({ cityCode: 'dhaka', days: 7, now: NOW, ...options });

beforeAll(async () => {
  await startTestDb();
  await User.init();
  customer = await makeUser(1, 'customer');
});
afterAll(stopTestDb);
beforeEach(async () => {
  ({ today } = await setUpShelf());
});

describe('demandByProduce', () => {
  it('counts kilos per day in Bangladesh time, leaving out today and days before the window', async () => {
    await order('2026-10-18T05:00:00Z'); // 18 October, 11:00 in Bangladesh
    await order('2026-10-18T19:00:00Z'); // already 19 October in Bangladesh (01:00)
    await order('2026-10-19T19:00:00Z'); // 20 October in Bangladesh: today, left out
    await order('2026-10-12T17:59:59Z'); // 12 October, 23:59 in Bangladesh: before the window
    await order('2026-10-12T18:00:00Z'); // 13 October, 00:00 in Bangladesh: first day of the window

    const { histories, endDate } = await demand();
    expect(endDate).toBe('2026-10-19');
    expect(histories.get('tomato').map((day) => day.date)).toEqual([
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
    ]);
    expect(histories.get('tomato').map((day) => day.kg)).toEqual([3, 0, 0, 0, 0, 3, 3]);
    expect(histories.get('cabbage').map((day) => day.kg)).toEqual([3, 0, 0, 0, 0, 3, 3]);
  });

  it('leaves out cancelled orders and other cities', async () => {
    await order('2026-10-18T05:00:00Z');
    const cancelled = await order('2026-10-18T06:00:00Z');
    await cancelOrder({ customer: { _id: customer._id }, code: cancelled.code });
    const elsewhere = await order('2026-10-18T07:00:00Z');
    await Order.collection.updateOne(
      { code: elsewhere.code },
      { $set: { cityCode: 'chattogram' } },
    );

    const { histories } = await demand();
    expect(histories.get('tomato').map((day) => day.kg)).toEqual([0, 0, 0, 0, 0, 3, 0]);
    const other = await demand({ cityCode: 'chattogram' });
    expect(other.histories.get('tomato').map((day) => day.kg)).toEqual([0, 0, 0, 0, 0, 3, 0]);
  });

  it('adds up several orders on the same day', async () => {
    await order('2026-10-18T05:00:00Z');
    await order('2026-10-18T08:00:00Z');
    const { histories } = await demand();
    expect(histories.get('tomato')[5].kg).toBe(6);
  });

  it('leaves out produce nobody ordered, and returns an empty map when there are no orders', async () => {
    await order('2026-10-18T05:00:00Z');
    const { histories } = await demand();
    expect([...histories.keys()].sort()).toEqual(['cabbage', 'tomato']);

    await Order.deleteMany({});
    expect((await demand()).histories.size).toBe(0);
  });

  it('uses the number of days it is asked for', async () => {
    await order('2026-10-18T05:00:00Z');
    const { histories } = await demand({ days: 3 });
    expect(histories.get('tomato').map((day) => day.date)).toEqual([
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
    ]);
    expect(histories.get('tomato').map((day) => day.kg)).toEqual([0, 3, 0]);
  });
});
