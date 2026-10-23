import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeLot } from '../helpers/lotFixture.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { Lot } from '../../src/models/Lot.js';
import { Produce } from '../../src/models/Produce.js';
import { seedCatalog } from '../../src/seed/catalog.js';
import { expireLots, repriceLots, runLotMaintenance } from '../../src/services/lots/maintenance.js';

const NOW = new Date('2026-07-15T06:00:00Z'); // 15 July, Bangladesh time
const farmer = new mongoose.Types.ObjectId();

const priceOf = async (code) => (await Lot.findOne({ code })).priceBdt;
const statusOf = async (code) => (await Lot.findOne({ code })).status;

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(async () => {
  await Promise.all([Lot.deleteMany({}), Produce.deleteMany({})]);
  await seedCatalog();
  // No seasons unless a test sets one, so prices never depend on the real date.
  await Produce.updateMany({}, { peakMonths: [] });
});

describe('expireLots', () => {
  it('expires listed lots whose time is up, including one expiring right now', async () => {
    const late = await makeLot({ farmer, now: NOW, listedHoursAgo: 130 });
    const exact = await makeLot({ farmer, now: NOW, listedHoursAgo: 120 });
    const fresh = await makeLot({ farmer, now: NOW, listedHoursAgo: 10 });

    expect(await expireLots(NOW)).toBe(2);
    expect(await statusOf(late.code)).toBe('expired');
    expect(await statusOf(exact.code)).toBe('expired');
    expect(await statusOf(fresh.code)).toBe('listed');
  });

  it('leaves withdrawn and sold-out lots alone', async () => {
    const withdrawn = await makeLot({ farmer, now: NOW, listedHoursAgo: 200, status: 'withdrawn' });
    const soldOut = await makeLot({
      farmer,
      now: NOW,
      listedHoursAgo: 200,
      status: 'sold_out',
      remainingKg: 0,
    });
    expect(await expireLots(NOW)).toBe(0);
    expect(await statusOf(withdrawn.code)).toBe('withdrawn');
    expect(await statusOf(soldOut.code)).toBe('sold_out');
  });
});

describe('repriceLots', () => {
  it('leaves a fresh lot at its price', async () => {
    const lot = await makeLot({ farmer, now: NOW, listedHoursAgo: 0 });
    expect(await repriceLots(NOW)).toEqual({ checked: 1, repriced: 0 });
    expect(await priceOf(lot.code)).toBe(56);
  });

  it('marks a lot down as its time runs out, down to the floor', async () => {
    const older = await makeLot({ farmer, now: NOW, listedHoursAgo: 54 }); // 66 hours left
    const nearEnd = await makeLot({ farmer, now: NOW, listedHoursAgo: 96 }); // 24 hours left

    expect(await repriceLots(NOW)).toEqual({ checked: 2, repriced: 2 });
    expect(await priceOf(older.code)).toBe(50);
    expect(await priceOf(nearEnd.code)).toBe(39);
  });

  it('never raises a price', async () => {
    const lot = await makeLot({ farmer, now: NOW, listedHoursAgo: 0, priceBdt: 45 });
    expect((await repriceLots(NOW)).repriced).toBe(0);
    expect(await priceOf(lot.code)).toBe(45);
  });

  it('keeps the farmer floor from listing, even if the bazar price later changes', async () => {
    const lot = await makeLot({ farmer, now: NOW, listedHoursAgo: 96 });
    await Produce.updateOne({ slug: 'tomato' }, { bazarPriceBdt: 200 });

    await repriceLots(NOW);
    const saved = await Lot.findOne({ code: lot.code });
    expect(saved.priceBdt).toBe(39);
    expect(saved.farmerFloorBdt).toBe(28);
  });

  it('marks down sooner when the produce is in season now', async () => {
    await Produce.updateOne({ slug: 'tomato' }, { peakMonths: [7] });
    const lot = await makeLot({ farmer, now: NOW, listedHoursAgo: 24 }); // 96 hours left
    await repriceLots(NOW);
    expect(await priceOf(lot.code)).toBe(50); // 56 without the season
  });

  it('skips lots that are expired, withdrawn or already past their time', async () => {
    const expired = await makeLot({ farmer, now: NOW, listedHoursAgo: 96, status: 'expired' });
    const withdrawn = await makeLot({ farmer, now: NOW, listedHoursAgo: 96, status: 'withdrawn' });
    const overdue = await makeLot({ farmer, now: NOW, listedHoursAgo: 130 });

    expect(await repriceLots(NOW)).toEqual({ checked: 0, repriced: 0 });
    for (const lot of [expired, withdrawn, overdue]) expect(await priceOf(lot.code)).toBe(56);
  });

  it('copes with produce that has been removed from the catalog', async () => {
    const lot = await makeLot({ farmer, now: NOW, listedHoursAgo: 96 });
    await Produce.deleteOne({ slug: 'tomato' });
    expect((await repriceLots(NOW)).repriced).toBe(1);
    expect(await priceOf(lot.code)).toBe(39);
  });
});

describe('runLotMaintenance', () => {
  it('expires first, then reprices only what is still on sale', async () => {
    const overdue = await makeLot({ farmer, now: NOW, listedHoursAgo: 130 });
    const ageing = await makeLot({ farmer, now: NOW, listedHoursAgo: 96 });

    expect(await runLotMaintenance(NOW)).toEqual({ expired: 1, checked: 1, repriced: 1 });
    expect(await statusOf(overdue.code)).toBe('expired');
    expect(await priceOf(overdue.code)).toBe(56);
    expect(await priceOf(ageing.code)).toBe(39);
  });

  it('is safe to run twice in a row', async () => {
    await makeLot({ farmer, now: NOW, listedHoursAgo: 96 });
    await runLotMaintenance(NOW);
    expect(await runLotMaintenance(NOW)).toEqual({ expired: 0, checked: 1, repriced: 0 });
  });
});
