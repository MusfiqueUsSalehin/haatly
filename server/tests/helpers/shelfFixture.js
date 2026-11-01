import mongoose from 'mongoose';
import { Box } from '../../src/models/Box.js';
import { City } from '../../src/models/City.js';
import { Hub } from '../../src/models/Hub.js';
import { LedgerEntry } from '../../src/models/LedgerEntry.js';
import { Lot } from '../../src/models/Lot.js';
import { Order } from '../../src/models/Order.js';
import { Payment } from '../../src/models/Payment.js';
import { Produce } from '../../src/models/Produce.js';
import { RiderProfile } from '../../src/models/RiderProfile.js';
import { Run } from '../../src/models/Run.js';
import { Zone } from '../../src/models/Zone.js';
import { seedCatalog } from '../../src/seed/catalog.js';
import { buildShelf } from '../../src/services/boxes/buildShelf.js';
import { bangladeshDate } from '../../src/utils/dates.js';
import { makeLot } from './lotFixture.js';

// Six lots of 100 kg at 56 taka/kg. The shelf this builds for Dhaka is:
//   mini   potato + spinach   112 taka   100 boxes
//   family cabbage + tomato   168 taka    66 boxes
//   bulk   carrot + okra      224 taka    50 boxes
const SIX = [
  ['AAAAAAAA', 'tomato'],
  ['BBBBBBBB', 'potato'],
  ['CCCCCCCC', 'okra'],
  ['DDDDDDDD', 'cabbage'],
  ['EEEEEEEE', 'spinach'],
  ['FFFFFFFF', 'carrot'],
];

/**
 * Reset the database to a seeded catalog plus today's built shelf. All six lots belong to
 * `farmer` (a random id unless you pass one). Returns { today, farmer }.
 */
export async function setUpShelf({
  now = new Date(),
  farmer = new mongoose.Types.ObjectId(),
} = {}) {
  await Promise.all(
    [Lot, Box, Hub, Produce, City, Zone, Order, Payment, Run, RiderProfile, LedgerEntry].map(
      (model) => model.deleteMany({}),
    ),
  );
  await seedCatalog();
  await Promise.all(
    SIX.map(([suffix, produceSlug]) =>
      makeLot({ farmer, now, hubCode: 'savar', produceSlug, code: `LOT-${suffix}` }),
    ),
  );
  await buildShelf({ now });
  return { today: bangladeshDate(now), farmer };
}
