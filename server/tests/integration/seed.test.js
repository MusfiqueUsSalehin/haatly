import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearTestDb, startTestDb, stopTestDb } from '../helpers/testDb.js';
import { seedCatalog } from '../../src/seed/catalog.js';
import { cities } from '../../src/seed/data/cities.js';
import { hubs } from '../../src/seed/data/hubs.js';
import { produce } from '../../src/seed/data/produce.js';
import { zones } from '../../src/seed/data/zones.js';
import { City } from '../../src/models/City.js';
import { Hub } from '../../src/models/Hub.js';
import { Produce } from '../../src/models/Produce.js';
import { Zone } from '../../src/models/Zone.js';

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(clearTestDb);

describe('seedCatalog', () => {
  it('loads everything into an empty database', async () => {
    const result = await seedCatalog();
    expect(result.cities.inserted).toBe(cities.length);
    expect(result.zones.inserted).toBe(zones.length);
    expect(result.hubs.inserted).toBe(hubs.length);
    expect(result.produce.inserted).toBe(produce.length);
    expect(await Produce.countDocuments()).toBe(produce.length);
    expect(await Hub.countDocuments({ kind: 'depot' })).toBe(2);
  });

  it('stamps a price date on new produce', async () => {
    await seedCatalog();
    const tomato = await Produce.findOne({ slug: 'tomato' });
    expect(tomato.bazarPriceUpdatedAt).toBeInstanceOf(Date);
  });

  it('is idempotent: a second run adds nothing', async () => {
    await seedCatalog();
    const second = await seedCatalog();
    for (const part of Object.values(second)) expect(part.inserted).toBe(0);
    expect(await Produce.countDocuments()).toBe(produce.length);
    expect(await Zone.countDocuments()).toBe(zones.length);
  });

  it('never overwrites a price an admin changed', async () => {
    await seedCatalog();
    await Produce.updateOne({ slug: 'tomato' }, { bazarPriceBdt: 95 });
    await seedCatalog();
    expect((await Produce.findOne({ slug: 'tomato' })).bazarPriceBdt).toBe(95);
  });

  it('restores only what is missing', async () => {
    await seedCatalog();
    await Hub.deleteOne({ code: 'jashore' });
    const result = await seedCatalog();
    expect(result.hubs).toEqual({ inserted: 1, existing: hubs.length - 1 });
  });

  it('refuses inconsistent data before writing anything', async () => {
    const bad = structuredClone({ cities, zones, hubs, produce });
    bad.zones[0].cityCode = 'nowhere';
    await expect(seedCatalog(bad)).rejects.toThrow(/inconsistent/);
    expect(await City.countDocuments()).toBe(0);
  });
});
