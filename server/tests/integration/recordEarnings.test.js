import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  dispatchAndDeliverAll,
  makeProfile,
  makeUser,
  placeOrderFor,
} from '../helpers/deliveryFixture.js';
import { makeLot } from '../helpers/lotFixture.js';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { LedgerEntry } from '../../src/models/LedgerEntry.js';
import { Lot } from '../../src/models/Lot.js';
import { Order } from '../../src/models/Order.js';
import { RiderProfile } from '../../src/models/RiderProfile.js';
import { Run } from '../../src/models/Run.js';
import { User } from '../../src/models/User.js';
import { cancelOrder } from '../../src/services/orders/cancelOrder.js';
import { backfillEarnings, recordEarnings } from '../../src/services/earnings/recordEarnings.js';

const env = makeTestEnv();
let today;
let f1;
let f2;
let customer;
let rider;

const placeAndDeliver = async (options) => {
  const order = await placeOrderFor(customer, today, options);
  await dispatchAndDeliverAll({ rider, otpSecret: env.JWT_SECRET });
  return order;
};

beforeAll(async () => {
  await startTestDb();
  await Promise.all([User.init(), Run.init(), RiderProfile.init(), LedgerEntry.init()]);
  f1 = await makeUser(1, 'farmer');
  f2 = await makeUser(2, 'farmer');
  customer = await makeUser(3, 'customer');
  rider = await makeUser(4, 'rider');
});
afterAll(stopTestDb);
beforeEach(async () => {
  ({ today } = await setUpShelf({ farmer: f1._id }));
  await Lot.updateOne({ code: 'LOT-DDDDDDDD' }, { farmer: f2._id });
  await makeProfile(rider, ['dhaka-mirpur', 'dhaka-uttara']);
});

describe('earnings recorded on delivery', () => {
  it('writes one entry per lot, from the exact kilos and prices of the order', async () => {
    const order = await placeAndDeliver();

    const entries = await LedgerEntry.find().sort({ lotCode: 1 });
    expect(entries.map((e) => [e.lotCode, String(e.farmer), e.produceSlug])).toEqual([
      ['LOT-AAAAAAAA', String(f1._id), 'tomato'],
      ['LOT-DDDDDDDD', String(f2._id), 'cabbage'],
    ]);
    expect(entries[0]).toMatchObject({
      orderCode: order.code,
      kg: 3,
      pricePerKgBdt: 56,
      floorBdt: 28,
      revenueBdt: 168,
      farmerBdt: 120.96,
      platformBdt: 47.04,
      status: 'unpaid',
    });
    const delivered = await Order.findOne({ code: order.code });
    expect(entries[0].deliveredAt).toEqual(delivered.deliveredAt);
  });

  it('is safe to record again, even twice at once', async () => {
    const order = await placeAndDeliver();
    const results = await Promise.all([recordEarnings(order.code), recordEarnings(order.code)]);
    expect(results).toEqual([
      { recorded: 0, existing: 2 },
      { recorded: 0, existing: 2 },
    ]);
    expect(await LedgerEntry.countDocuments()).toBe(2);
  });

  it('records exactly once when two first-time calls race', async () => {
    const order = await placeOrderFor(customer, today);
    await Order.updateOne({ code: order.code }, { status: 'delivered', deliveredAt: new Date() });

    const results = await Promise.all([recordEarnings(order.code), recordEarnings(order.code)]);
    expect(results.reduce((sum, r) => sum + r.recorded, 0)).toBe(2);
    expect(await LedgerEntry.countDocuments()).toBe(2);
  });

  it('records nothing for orders that are not delivered, cancelled or unknown', async () => {
    const waiting = await placeOrderFor(customer, today);
    const gone = await placeOrderFor(customer, today);
    await cancelOrder({ customer: { _id: customer._id }, code: gone.code });

    expect(await recordEarnings(waiting.code)).toEqual({ recorded: 0, existing: 0 });
    expect(await recordEarnings(gone.code)).toEqual({ recorded: 0, existing: 0 });
    expect(await recordEarnings('ORD-AAAAAAAA')).toEqual({ recorded: 0, existing: 0 });
    expect(await LedgerEntry.countDocuments()).toBe(0);
  });

  it('uses the price the customer paid, not the lot price of today', async () => {
    const order = await placeOrderFor(customer, today);
    await Order.updateOne({ code: order.code }, { status: 'delivered', deliveredAt: new Date() });
    await Lot.updateMany({}, { priceBdt: 10 });

    await recordEarnings(order.code);
    const entries = await LedgerEntry.find();
    expect(entries.every((e) => e.pricePerKgBdt === 56)).toBe(true);
  });
});

describe('when the ledger cannot be written', () => {
  it('never breaks a delivery, and the backfill fixes it later', async () => {
    const order = await placeOrderFor(customer, today);
    await Lot.deleteOne({ code: 'LOT-AAAAAAAA' });
    await dispatchAndDeliverAll({ rider, otpSecret: env.JWT_SECRET });

    expect((await Order.findOne({ code: order.code })).status).toBe('delivered');
    expect(await LedgerEntry.countDocuments()).toBe(0);

    const first = await backfillEarnings();
    expect(first.recorded).toBe(0);
    expect(first.failed).toEqual([
      { orderCode: order.code, error: expect.stringContaining('LOT-AAAAAAAA') },
    ]);

    await makeLot({
      farmer: f1._id,
      code: 'LOT-AAAAAAAA',
      produceSlug: 'tomato',
      hubCode: 'savar',
    });
    expect(await backfillEarnings()).toEqual({ checked: 1, recorded: 2, failed: [] });
  });

  it('backfill records delivered orders that have no entries, then finds nothing to do', async () => {
    const order = await placeOrderFor(customer, today);
    await Order.updateOne({ code: order.code }, { status: 'delivered', deliveredAt: new Date() });

    expect(await backfillEarnings()).toEqual({ checked: 1, recorded: 2, failed: [] });
    expect(await backfillEarnings()).toEqual({ checked: 1, recorded: 0, failed: [] });
  });
});
