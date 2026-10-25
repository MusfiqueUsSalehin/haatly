import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeLot } from '../helpers/lotFixture.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { Lot } from '../../src/models/Lot.js';
import { releaseStock, reserveStock } from '../../src/services/orders/stock.js';

const farmer = new mongoose.Types.ObjectId();
const alloc = (lotCode, kg) => ({ lotCode, produceSlug: 'tomato', kg, pricePerKgBdt: 56 });
const lotOf = (code) => Lot.findOne({ code });
const rejection = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return null;
};

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(() => Lot.deleteMany({}));

describe('reserveStock', () => {
  it('takes the kilos from every lot', async () => {
    await makeLot({ farmer, code: 'LOT-AAAAAAAA', remainingKg: 10 });
    await makeLot({ farmer, code: 'LOT-BBBBBBBB', remainingKg: 5 });

    await reserveStock([alloc('LOT-AAAAAAAA', 4), alloc('LOT-BBBBBBBB', 5)]);

    expect(await lotOf('LOT-AAAAAAAA')).toMatchObject({ remainingKg: 6, status: 'listed' });
    expect(await lotOf('LOT-BBBBBBBB')).toMatchObject({ remainingKg: 0, status: 'sold_out' });
  });

  it('can take exactly what is left, and marks the lot sold out', async () => {
    await makeLot({ farmer, code: 'LOT-AAAAAAAA', remainingKg: 10 });
    await reserveStock([alloc('LOT-AAAAAAAA', 10)]);
    expect(await lotOf('LOT-AAAAAAAA')).toMatchObject({ remainingKg: 0, status: 'sold_out' });
  });

  it('refuses more than is left and changes nothing', async () => {
    await makeLot({ farmer, code: 'LOT-AAAAAAAA', remainingKg: 10 });
    const err = await rejection(reserveStock([alloc('LOT-AAAAAAAA', 11)]));
    expect(err).toMatchObject({ status: 409, code: 'stock_changed' });
    expect(err.details).toEqual({ lotCode: 'LOT-AAAAAAAA' });
    expect((await lotOf('LOT-AAAAAAAA')).remainingKg).toBe(10);
  });

  it('puts back what it already took when a later lot cannot supply its share', async () => {
    await makeLot({ farmer, code: 'LOT-AAAAAAAA', remainingKg: 10 });
    await makeLot({ farmer, code: 'LOT-BBBBBBBB', remainingKg: 5 });

    const err = await rejection(reserveStock([alloc('LOT-AAAAAAAA', 4), alloc('LOT-BBBBBBBB', 6)]));

    expect(err.code).toBe('stock_changed');
    expect(await lotOf('LOT-AAAAAAAA')).toMatchObject({ remainingKg: 10, status: 'listed' });
    expect(await lotOf('LOT-BBBBBBBB')).toMatchObject({ remainingKg: 5, status: 'listed' });
  });

  it('refuses lots that are withdrawn, expired or sold out', async () => {
    await makeLot({ farmer, code: 'LOT-AAAAAAAA', status: 'withdrawn' });
    await makeLot({ farmer, code: 'LOT-BBBBBBBB', listedHoursAgo: 200 });
    await makeLot({ farmer, code: 'LOT-CCCCCCCC', status: 'sold_out', remainingKg: 0 });

    for (const code of ['LOT-AAAAAAAA', 'LOT-BBBBBBBB', 'LOT-CCCCCCCC']) {
      const err = await rejection(reserveStock([alloc(code, 1)]));
      expect(err).toMatchObject({ status: 409, code: 'stock_changed' });
    }
    expect((await lotOf('LOT-AAAAAAAA')).remainingKg).toBe(100);
    expect((await lotOf('LOT-BBBBBBBB')).remainingKg).toBe(100);
  });

  it('lets only one of two simultaneous orders have the last kilos', async () => {
    await makeLot({ farmer, code: 'LOT-AAAAAAAA', remainingKg: 10 });

    const results = await Promise.allSettled([
      reserveStock([alloc('LOT-AAAAAAAA', 6)]),
      reserveStock([alloc('LOT-AAAAAAAA', 6)]),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await lotOf('LOT-AAAAAAAA')).remainingKg).toBe(4);
  });
});

describe('releaseStock', () => {
  it('puts kilos back and relists a lot that had sold out', async () => {
    await makeLot({ farmer, code: 'LOT-AAAAAAAA', remainingKg: 10 });
    await reserveStock([alloc('LOT-AAAAAAAA', 10)]);
    expect((await lotOf('LOT-AAAAAAAA')).status).toBe('sold_out');

    await releaseStock([alloc('LOT-AAAAAAAA', 10)]);
    expect(await lotOf('LOT-AAAAAAAA')).toMatchObject({ remainingKg: 10, status: 'listed' });
  });

  it('does not put a withdrawn lot back on sale', async () => {
    await makeLot({ farmer, code: 'LOT-AAAAAAAA', remainingKg: 10 });
    await reserveStock([alloc('LOT-AAAAAAAA', 4)]);
    await Lot.updateOne({ code: 'LOT-AAAAAAAA' }, { status: 'withdrawn' });

    await releaseStock([alloc('LOT-AAAAAAAA', 4)]);
    expect(await lotOf('LOT-AAAAAAAA')).toMatchObject({ remainingKg: 10, status: 'withdrawn' });
  });

  it('does not put an expired lot back on sale', async () => {
    await makeLot({ farmer, code: 'LOT-AAAAAAAA', remainingKg: 10 });
    await reserveStock([alloc('LOT-AAAAAAAA', 10)]);
    await Lot.updateOne({ code: 'LOT-AAAAAAAA' }, { expiresAt: new Date(Date.now() - 1000) });

    await releaseStock([alloc('LOT-AAAAAAAA', 10)]);
    expect(await lotOf('LOT-AAAAAAAA')).toMatchObject({ remainingKg: 10, status: 'sold_out' });
  });

  it('does nothing for an empty list', async () => {
    await expect(releaseStock([])).resolves.toBeUndefined();
  });
});
