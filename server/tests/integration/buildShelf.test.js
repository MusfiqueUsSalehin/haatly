import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeLot } from '../helpers/lotFixture.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { Box } from '../../src/models/Box.js';
import { City } from '../../src/models/City.js';
import { Hub } from '../../src/models/Hub.js';
import { Lot } from '../../src/models/Lot.js';
import { Produce } from '../../src/models/Produce.js';
import { seedCatalog } from '../../src/seed/catalog.js';
import { buildShelf } from '../../src/services/boxes/buildShelf.js';

const NOW = new Date('2026-07-15T06:00:00Z'); // 15 July in Bangladesh
const DATE = '2026-07-15';
const farmer = new mongoose.Types.ObjectId();

// Six equal lots of six different produce: A..F.
const SIX = [
  ['AAAAAAAA', 'tomato'],
  ['BBBBBBBB', 'potato'],
  ['CCCCCCCC', 'okra'],
  ['DDDDDDDD', 'cabbage'],
  ['EEEEEEEE', 'spinach'],
  ['FFFFFFFF', 'carrot'],
];
const stock = (hubCode, tag = '') =>
  Promise.all(
    SIX.map(([suffix, produceSlug]) =>
      makeLot({ farmer, now: NOW, hubCode, produceSlug, code: `LOT-${tag}${suffix}` }),
    ),
  );

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(async () => {
  await Promise.all([
    Lot.deleteMany({}),
    Box.deleteMany({}),
    Hub.deleteMany({}),
    Produce.deleteMany({}),
    City.deleteMany({}),
  ]);
  await seedCatalog();
});

describe('buildShelf', () => {
  it('builds each size from live lots and skips cities with no stock', async () => {
    await stock('savar');
    const result = await buildShelf({ now: NOW });

    expect(result.date).toBe(DATE);
    expect([...result.built].sort()).toEqual([
      'dhaka-bulk-2026-07-15',
      'dhaka-family-2026-07-15',
      'dhaka-mini-2026-07-15',
    ]);
    expect(result.closed).toBe(0);
    const chattogram = result.skippedBoxes.filter((skip) => skip.cityCode === 'chattogram');
    expect(chattogram).toHaveLength(3);
    expect(chattogram.every((skip) => skip.reason === 'no_stock')).toBe(true);

    const family = await Box.findOne({ code: `dhaka-family-${DATE}` });
    expect(family).toMatchObject({ weightKg: 3, builtPriceBdt: 168, status: 'live' });
    expect(family.lines.map((line) => line.produceSlug)).toEqual(['cabbage', 'tomato']);
    expect(family.lines.map((line) => [...line.lotCodes])).toEqual([
      ['LOT-DDDDDDDD'],
      ['LOT-AAAAAAAA'],
    ]);
    expect((await Box.findOne({ code: `dhaka-mini-${DATE}` })).builtPriceBdt).toBe(112);
    expect((await Box.findOne({ code: `dhaka-bulk-${DATE}` })).builtPriceBdt).toBe(224);
  });

  it('is safe to run twice', async () => {
    await stock('savar');
    await buildShelf({ now: NOW });
    const again = await buildShelf({ now: NOW });
    expect(again.closed).toBe(0);
    expect(await Box.countDocuments()).toBe(3);
    expect(await Box.countDocuments({ status: 'live' })).toBe(3);
  });

  it('survives two builds running at the same time', async () => {
    await stock('savar');
    await Promise.all([buildShelf({ now: NOW }), buildShelf({ now: NOW })]);
    expect(await Box.countDocuments()).toBe(3);
    expect(await Box.countDocuments({ status: 'live' })).toBe(3);
  });

  it('closes a box that can no longer be built', async () => {
    await stock('savar');
    await buildShelf({ now: NOW });

    await Lot.updateOne({ code: 'LOT-AAAAAAAA' }, { status: 'withdrawn' });
    const second = await buildShelf({ now: NOW });

    expect(second.built).toHaveLength(2);
    expect((await Box.findOne({ code: `dhaka-bulk-${DATE}` })).status).toBe('closed');
    expect(await Box.countDocuments({ status: 'live' })).toBe(2);
    const family = await Box.findOne({ code: `dhaka-family-${DATE}` });
    expect(family.lines.map((line) => line.produceSlug)).toEqual(['potato', 'spinach']);
  });

  it('closes boxes left over from earlier days', async () => {
    await Box.create({
      code: 'dhaka-mini-2026-07-14',
      cityCode: 'dhaka',
      tier: 'mini',
      date: '2026-07-14',
      lines: [
        { produceSlug: 'tomato', kgPerBox: 1, lotCodes: ['X'] },
        { produceSlug: 'potato', kgPerBox: 1, lotCodes: ['Y'] },
      ],
      weightKg: 2,
      builtPriceBdt: 100,
    });
    await stock('savar');
    const result = await buildShelf({ now: NOW });
    expect(result.closed).toBe(1);
    expect((await Box.findOne({ code: 'dhaka-mini-2026-07-14' })).status).toBe('closed');
  });

  it('leaves out lots too close to expiry to survive the trip', async () => {
    await stock('savar');
    // 20 hours left, and the truck takes 1: less than the 24 hours it needs after arriving.
    await makeLot({
      farmer,
      now: NOW,
      hubCode: 'savar',
      listedHoursAgo: 100,
      code: 'LOT-LATE0000',
    });
    const result = await buildShelf({ now: NOW });
    expect(result.skippedLots).toEqual([{ lotCode: 'LOT-LATE0000', reason: 'no_reachable_city' }]);
  });

  it('builds each city from its own lots, with no lot in two boxes', async () => {
    await stock('savar');
    await stock('hathazari', 'X');
    const result = await buildShelf({ now: NOW });
    expect(result.built).toHaveLength(6);

    const boxes = await Box.find();
    const used = boxes.flatMap((box) => box.lines.flatMap((line) => [...line.lotCodes]));
    expect(used).toHaveLength(12);
    expect(new Set(used).size).toBe(12);

    for (const box of boxes.filter((b) => b.cityCode === 'chattogram')) {
      for (const line of box.lines) {
        for (const code of line.lotCodes) expect(code.startsWith('LOT-X')).toBe(true);
      }
    }
  });

  it('uses the Bangladesh date', async () => {
    const result = await buildShelf({ now: new Date('2026-07-15T20:00:00Z') });
    expect(result.date).toBe('2026-07-16');
  });
});
