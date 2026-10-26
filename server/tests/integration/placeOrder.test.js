import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { ORDER_CODE_PATTERN } from '../../src/constants/orders.js';
import { Box } from '../../src/models/Box.js';
import { Lot } from '../../src/models/Lot.js';
import { Order } from '../../src/models/Order.js';
import { Zone } from '../../src/models/Zone.js';
import { placeOrder } from '../../src/services/orders/placeOrder.js';

const customer = { _id: new mongoose.Types.ObjectId() };
let today;

const body = (items, overrides = {}) => ({
  recipientName: 'Rahim Uddin',
  phone: '+8801712345678',
  zoneCode: 'dhaka-mirpur',
  address: { line: 'House 12, Road 3, Mirpur 10' },
  paymentMethod: 'cod',
  items,
  ...overrides,
});
const family = (qty, seenUnitPriceBdt = 168) => ({
  boxCode: `dhaka-family-${today}`,
  qty,
  seenUnitPriceBdt,
});
const mini = (qty, seenUnitPriceBdt = 112) => ({
  boxCode: `dhaka-mini-${today}`,
  qty,
  seenUnitPriceBdt,
});
const place = (items, overrides) => placeOrder({ customer, body: body(items, overrides) });
const remaining = async (code) => (await Lot.findOne({ code })).remainingKg;
const failure = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return null;
};

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(async () => {
  ({ today } = await setUpShelf());
});

describe('placeOrder', () => {
  it('reserves the stock and records exactly which lots the kilos came from', async () => {
    const order = await place([family(2)]);

    expect(order.code).toMatch(ORDER_CODE_PATTERN);
    expect(order).toMatchObject({
      status: 'placed',
      paymentStatus: 'unpaid',
      cityCode: 'dhaka',
      zoneCode: 'dhaka-mirpur',
      subtotalBdt: 336,
      deliveryFeeBdt: 40,
      totalBdt: 376,
    });
    expect(order.statusHistory.map((h) => h.status)).toEqual(['placed']);
    expect(order.items[0].allocations.map((a) => [a.lotCode, a.kg, a.pricePerKgBdt])).toEqual([
      ['LOT-DDDDDDDD', 3, 56],
      ['LOT-AAAAAAAA', 3, 56],
    ]);
    expect(await remaining('LOT-DDDDDDDD')).toBe(97);
    expect(await remaining('LOT-AAAAAAAA')).toBe(97);
    expect(await Order.countDocuments()).toBe(1);
  });

  it('handles several boxes in one order', async () => {
    const order = await place([family(2), mini(1)]);
    expect(order).toMatchObject({ subtotalBdt: 448, deliveryFeeBdt: 40, totalBdt: 488 });
    expect(await remaining('LOT-BBBBBBBB')).toBe(99);
    expect(await remaining('LOT-EEEEEEEE')).toBe(99);
  });

  it('waives delivery from 500 taka', async () => {
    const order = await place([family(3, 168)]);
    expect(order).toMatchObject({ subtotalBdt: 504, deliveryFeeBdt: 0, totalBdt: 504 });
  });

  it('charges the lower price when it dropped since the customer saw it', async () => {
    await Lot.updateOne({ code: 'LOT-AAAAAAAA' }, { priceBdt: 40 });
    const order = await place([family(1)]);
    expect(order.items[0].unitPriceBdt).toBe(144); // 1.5 x 56 + 1.5 x 40
    expect(order.totalBdt).toBe(184);
  });

  it('refuses when the price went up, and takes nothing', async () => {
    const err = await failure(place([family(1, 150)]));
    expect(err).toMatchObject({ status: 409, code: 'price_changed' });
    expect(err.details).toEqual({
      boxCode: `dhaka-family-${today}`,
      seenPriceBdt: 150,
      currentPriceBdt: 168,
    });
    expect(await remaining('LOT-AAAAAAAA')).toBe(100);
  });

  it('refuses more boxes than the stock can fill, and takes nothing for any box', async () => {
    await Lot.updateOne({ code: 'LOT-AAAAAAAA' }, { remainingKg: 3 }); // 2 family boxes left
    const err = await failure(place([mini(1), family(3)]));
    expect(err).toMatchObject({ status: 409, code: 'insufficient_stock' });
    expect(err.details.produceSlug).toBe('tomato');
    expect(await remaining('LOT-BBBBBBBB')).toBe(100); // the mini box was not reserved either
    expect(await Order.countDocuments()).toBe(0);
  });

  it('refuses boxes that are closed, unknown, or in another city', async () => {
    await Box.updateOne({ code: `dhaka-mini-${today}` }, { status: 'closed' });
    expect((await failure(place([mini(1)]))).code).toBe('box_not_found');
    expect((await failure(place([{ ...mini(1), boxCode: 'dhaka-mini-1999-01-01' }]))).status).toBe(
      404,
    );
    const wrongCity = await failure(place([family(1)], { zoneCode: 'chattogram-gec' }));
    expect(wrongCity).toMatchObject({ status: 404, code: 'box_not_found' });
  });

  it('refuses an unknown or inactive delivery area', async () => {
    expect((await failure(place([family(1)], { zoneCode: 'dhaka-nowhere' }))).code).toBe(
      'zone_not_found',
    );
    await Zone.updateOne({ code: 'dhaka-mirpur' }, { active: false });
    expect((await failure(place([family(1)]))).code).toBe('zone_not_found');
  });

  it('refuses a box whose lot was withdrawn', async () => {
    await Lot.updateOne({ code: 'LOT-AAAAAAAA' }, { status: 'withdrawn' });
    expect((await failure(place([family(1)]))).code).toBe('insufficient_stock');
  });

  it('gives the last kilos to only one of two simultaneous orders', async () => {
    await Lot.updateOne({ code: 'LOT-AAAAAAAA' }, { remainingKg: 3 }); // exactly 2 boxes
    const results = await Promise.allSettled([place([family(2)]), place([family(2)])]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((r) => r.status === 'rejected');
    expect(loser.reason.status).toBe(409);
    expect(await Order.countDocuments()).toBe(1);

    const tomato = await Lot.findOne({ code: 'LOT-AAAAAAAA' });
    expect(tomato).toMatchObject({ remainingKg: 0, status: 'sold_out' });
    expect(await remaining('LOT-DDDDDDDD')).toBe(97); // the loser gave its cabbage back
  });

  it('puts the stock back if the order cannot be saved', async () => {
    const err = await failure(place([family(2)], { address: { line: 'x' } }));
    expect(err.name).toBe('ValidationError');
    expect(await remaining('LOT-DDDDDDDD')).toBe(100);
    expect(await remaining('LOT-AAAAAAAA')).toBe(100);
    expect(await Order.countDocuments()).toBe(0);
  });
});
