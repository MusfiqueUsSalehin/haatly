import { City } from '../models/City.js';
import { Hub } from '../models/Hub.js';
import { Produce } from '../models/Produce.js';
import { Zone } from '../models/Zone.js';
import { checkCatalogData } from './checkCatalog.js';
import { cities } from './data/cities.js';
import { hubs } from './data/hubs.js';
import { produce } from './data/produce.js';
import { zones } from './data/zones.js';

/** Insert documents whose key is not in the database yet. Existing ones are left alone. */
async function insertMissing(Model, key, docs) {
  let inserted = 0;
  for (const doc of docs) {
    if (await Model.exists({ [key]: doc[key] })) continue;
    await Model.create(doc); // create() runs full validation
    inserted += 1;
  }
  return { inserted, existing: docs.length - inserted };
}

/**
 * Load the starting catalog. Safe to run any number of times: it only adds what is
 * missing and never overwrites prices or settings an admin has changed since.
 */
export async function seedCatalog(data = { cities, zones, hubs, produce }) {
  const problems = checkCatalogData(data);
  if (problems.length > 0) {
    throw new Error(`Seed data is inconsistent:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }

  const now = new Date();
  return {
    cities: await insertMissing(City, 'code', data.cities),
    zones: await insertMissing(Zone, 'code', data.zones),
    hubs: await insertMissing(Hub, 'code', data.hubs),
    produce: await insertMissing(
      Produce,
      'slug',
      data.produce.map((item) => ({ ...item, bazarPriceUpdatedAt: now })),
    ),
  };
}
