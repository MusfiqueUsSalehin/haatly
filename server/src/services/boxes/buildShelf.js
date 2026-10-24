import { BOX_STATUS, Box } from '../../models/Box.js';
import { City } from '../../models/City.js';
import { Hub } from '../../models/Hub.js';
import { Lot, sellableFilter } from '../../models/Lot.js';
import { Produce } from '../../models/Produce.js';
import { bangladeshDate } from '../../utils/dates.js';
import { assignLotsToCities, splitByTier } from './assignStock.js';
import { buildCityBoxes } from './buildRecipes.js';

/** Validate a recipe, then create or update the box with that code. */
async function saveBox({ unitsAtBuild: _units, ...fields }) {
  await new Box(fields).validate();
  const write = () =>
    Box.updateOne(
      { code: fields.code },
      { $set: { ...fields, status: BOX_STATUS.LIVE } },
      { upsert: true },
    );
  try {
    await write();
  } catch (err) {
    // Two builds racing to create the same box: the second one just updates it.
    if (err?.code !== 11000) throw err;
    await write();
  }
}

/**
 * Build the shelf for every city from the lots that are for sale right now. Safe to run
 * any number of times: boxes keep their codes, so a rebuild updates them in place. Boxes
 * that can no longer be built, and boxes from earlier days, are closed.
 */
export async function buildShelf({ now = new Date(), date = bangladeshDate(now) } = {}) {
  const [cities, hubs, produce, lots] = await Promise.all([
    City.find({ active: true }).lean(),
    Hub.find({ kind: 'collection', active: true }).lean(),
    Produce.find({ active: true }).lean(),
    Lot.find(sellableFilter(now)).lean(),
  ]);
  const cityCodes = cities.map((city) => city.code);
  const produceBySlug = Object.fromEntries(produce.map((item) => [item.slug, item]));

  const { byCity, skipped: skippedLots } = assignLotsToCities({ lots, hubs, cityCodes, now });

  const built = [];
  const skippedBoxes = [];
  for (const cityCode of cityCodes) {
    const result = buildCityBoxes({
      cityCode,
      date,
      lotsByTier: splitByTier(byCity[cityCode] ?? []),
      produceBySlug,
      now,
    });
    for (const box of result.boxes) {
      await saveBox(box);
      built.push(box.code);
    }
    skippedBoxes.push(...result.skipped.map((skip) => ({ cityCode, ...skip })));
  }

  const { modifiedCount } = await Box.updateMany(
    {
      status: BOX_STATUS.LIVE,
      $or: [{ date: { $lt: date } }, { date, code: { $nin: built } }],
    },
    { status: BOX_STATUS.CLOSED },
  );

  return { date, built, closed: modifiedCount, skippedBoxes, skippedLots };
}
