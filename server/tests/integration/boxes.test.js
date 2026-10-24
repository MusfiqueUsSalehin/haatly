import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeLot } from '../helpers/lotFixture.js';
import { makeTestApp } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { Box } from '../../src/models/Box.js';
import { City } from '../../src/models/City.js';
import { Hub } from '../../src/models/Hub.js';
import { Lot } from '../../src/models/Lot.js';
import { Produce } from '../../src/models/Produce.js';
import { seedCatalog } from '../../src/seed/catalog.js';
import { buildShelf } from '../../src/services/boxes/buildShelf.js';
import { bangladeshDate } from '../../src/utils/dates.js';

const app = makeTestApp();
const NOW = new Date();
const TODAY = bangladeshDate(NOW);
const farmer = new mongoose.Types.ObjectId();
const get = (path) => request(app).get(`/api/boxes${path}`);

const SIX = [
  ['AAAAAAAA', 'tomato'],
  ['BBBBBBBB', 'potato'],
  ['CCCCCCCC', 'okra'],
  ['DDDDDDDD', 'cabbage'],
  ['EEEEEEEE', 'spinach'],
  ['FFFFFFFF', 'carrot'],
];

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
  await Promise.all(
    SIX.map(([suffix, produceSlug]) =>
      makeLot({ farmer, now: NOW, hubCode: 'savar', produceSlug, code: `LOT-${suffix}` }),
    ),
  );
  await buildShelf({ now: NOW });
});

describe('GET /api/boxes', () => {
  it("lists today's boxes with live units and prices, without a token", async () => {
    const res = await get('?city=dhaka');
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(TODAY);
    expect(res.body.boxes.map((box) => box.tier)).toEqual(['mini', 'family', 'bulk']);
    expect(res.body.boxes.map((box) => box.priceBdt)).toEqual([112, 168, 224]);
    expect(res.body.boxes.map((box) => box.unitsAvailable)).toEqual([100, 66, 50]);

    const family = res.body.boxes[1];
    expect(family.lines.map((line) => line.nameEn)).toEqual(['Cabbage', 'Tomato']);
    expect(family.lines[0]).toMatchObject({ nameBn: 'বাঁধাকপি', kgPerBox: 1.5 });
  });

  it('hides a box once one of its lines has no stock left', async () => {
    await Lot.updateOne({ code: 'LOT-AAAAAAAA' }, { status: 'withdrawn' });
    const res = await get('?city=dhaka');
    expect(res.body.boxes.map((box) => box.tier)).toEqual(['mini', 'bulk']);
  });

  it('follows a lot being marked down', async () => {
    await Lot.updateOne({ code: 'LOT-BBBBBBBB' }, { priceBdt: 40 });
    const mini = (await get('?city=dhaka')).body.boxes[0];
    expect(mini.priceBdt).toBe(96); // potato 40 + spinach 56
  });

  it('follows the stock left', async () => {
    await Lot.updateOne({ code: 'LOT-EEEEEEEE' }, { remainingKg: 9 });
    const mini = (await get('?city=dhaka')).body.boxes[0];
    expect(mini.unitsAvailable).toBe(9);
    expect(mini.priceBdt).toBe(112);
  });

  it('returns an empty shelf for a city with no boxes', async () => {
    const res = await get('?city=chattogram');
    expect(res.status).toBe(200);
    expect(res.body.boxes).toEqual([]);
  });

  it('requires a valid city', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('?city=BAD CITY')).status).toBe(400);
  });
});

describe('GET /api/boxes/:code', () => {
  it('returns one box with its lines and savings', async () => {
    const res = await get(`/dhaka-family-${TODAY}`);
    expect(res.status).toBe(200);
    expect(res.body.box).toMatchObject({
      tier: 'family',
      unitsAvailable: 66,
      soldOut: false,
      priceBdt: 168,
      bazarValueBdt: 165, // cabbage 40 + tomato 70, 1.5 kg each
      savingsPct: 0, // the test lots are priced above bazar, and savings never go negative
    });
  });

  it('still answers for a sold-out box, saying so', async () => {
    await Lot.updateOne({ code: 'LOT-AAAAAAAA' }, { status: 'withdrawn' });
    const res = await get(`/dhaka-family-${TODAY}`);
    expect(res.status).toBe(200);
    expect(res.body.box).toMatchObject({ soldOut: true, unitsAvailable: 0, priceBdt: null });
  });

  it('returns 404 for a closed or unknown box and 400 for a malformed code', async () => {
    await Box.updateOne({ code: `dhaka-family-${TODAY}` }, { status: 'closed' });
    const closed = await get(`/dhaka-family-${TODAY}`);
    expect(closed.status).toBe(404);
    expect(closed.body.error.code).toBe('box_not_found');
    expect((await get('/dhaka-mini-1999-01-01')).status).toBe(404);
    expect((await get('/BAD_CODE')).status).toBe(400);
  });
});
