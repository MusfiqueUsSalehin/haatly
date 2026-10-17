import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp } from '../helpers/testApp.js';
import { clearTestDb, startTestDb, stopTestDb } from '../helpers/testDb.js';
import { seedCatalog } from '../../src/seed/catalog.js';
import { hubs } from '../../src/seed/data/hubs.js';
import { produce } from '../../src/seed/data/produce.js';
import { Produce } from '../../src/models/Produce.js';
import { Zone } from '../../src/models/Zone.js';

const app = makeTestApp();
const get = (path) => request(app).get(`/api/catalog${path}`);

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(async () => {
  await clearTestDb();
  await seedCatalog();
});

describe('GET /api/catalog/produce', () => {
  it('lists active produce sorted by English name, with Bangla names', async () => {
    const res = await get('/produce');
    expect(res.status).toBe(200);
    expect(res.body.produce).toHaveLength(produce.length);

    const names = res.body.produce.map((p) => p.nameEn);
    expect(names).toEqual([...names].sort());

    const tomato = res.body.produce.find((p) => p.slug === 'tomato');
    expect(tomato).toMatchObject({ nameBn: 'টমেটো', bazarPriceBdt: 70, shelfLifeDays: 5 });
    expect(tomato._id).toBeUndefined();
  });

  it('filters by category', async () => {
    const res = await get('/produce?category=leafy');
    expect(res.body.produce).toHaveLength(3);
    expect(res.body.produce.every((p) => p.category === 'leafy')).toBe(true);
  });

  it('hides inactive produce', async () => {
    await Produce.updateOne({ slug: 'tomato' }, { active: false });
    const res = await get('/produce');
    expect(res.body.produce).toHaveLength(produce.length - 1);
    expect(res.body.produce.some((p) => p.slug === 'tomato')).toBe(false);
  });

  it('rejects an unknown category', async () => {
    const res = await get('/produce?category=meat');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });
});

describe('GET /api/catalog/produce/:slug', () => {
  it('returns one item', async () => {
    const res = await get('/produce/green-chilli');
    expect(res.status).toBe(200);
    expect(res.body.produce.nameBn).toBe('কাঁচা মরিচ');
  });

  it('returns 404 for an unknown slug', async () => {
    const res = await get('/produce/dragonfruit');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('produce_not_found');
  });

  it('returns 404 for an inactive item', async () => {
    await Produce.updateOne({ slug: 'tomato' }, { active: false });
    expect((await get('/produce/tomato')).status).toBe(404);
  });

  it('rejects a malformed slug', async () => {
    expect((await get('/produce/BAD_SLUG')).status).toBe(400);
  });
});

describe('GET /api/catalog/cities', () => {
  it('returns each city with its zones', async () => {
    const res = await get('/cities');
    expect(res.status).toBe(200);
    expect(res.body.cities).toHaveLength(2);

    const dhaka = res.body.cities.find((c) => c.code === 'dhaka');
    const chattogram = res.body.cities.find((c) => c.code === 'chattogram');
    expect(dhaka.zones).toHaveLength(7);
    expect(chattogram.zones).toHaveLength(5);
    expect(dhaka.zones.every((z) => z.cityCode === 'dhaka')).toBe(true);
    expect(dhaka._id).toBeUndefined();
  });

  it('hides inactive zones', async () => {
    await Zone.updateOne({ code: 'dhaka-badda' }, { active: false });
    const res = await get('/cities');
    const dhaka = res.body.cities.find((c) => c.code === 'dhaka');
    expect(dhaka.zones).toHaveLength(6);
  });
});

describe('GET /api/catalog/hubs', () => {
  it('lists every active hub by name when no city is given', async () => {
    const res = await get('/hubs');
    expect(res.status).toBe(200);
    expect(res.body.hubs).toHaveLength(hubs.length);
  });

  it('returns the depot and supplying hubs for a city, nearest first', async () => {
    const res = await get('/hubs?city=dhaka');
    expect(res.body.hubs.map((h) => h.code)).toEqual([
      'dhaka-depot',
      'savar',
      'munshiganj',
      'cumilla',
      'bogura',
      'jashore',
      'rangpur',
    ]);
    expect(res.body.hubs[0].truckHoursToCity).toBeNull();
    expect(res.body.hubs[1].truckHoursToCity).toBe(1);
  });

  it('filters by kind and only offers hubs that can reach the city', async () => {
    const res = await get('/hubs?city=chattogram&kind=collection');
    expect(res.body.hubs.map((h) => [h.code, h.truckHoursToCity])).toEqual([
      ['hathazari', 1],
      ['cumilla', 3.5],
      ['jashore', 9.5],
      ['bogura', 10],
      ['rangpur', 12],
    ]);
  });

  it('returns an empty list for a city nobody serves', async () => {
    const res = await get('/hubs?city=sylhet');
    expect(res.status).toBe(200);
    expect(res.body.hubs).toEqual([]);
  });

  it('rejects an unknown kind', async () => {
    expect((await get('/hubs?kind=warehouse')).status).toBe(400);
  });
});
