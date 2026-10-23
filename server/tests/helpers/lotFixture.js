import { Lot } from '../../src/models/Lot.js';
import { randomCode } from '../../src/utils/ids.js';

const HOUR = 3600 * 1000;

/** Insert a lot directly, listed `listedHoursAgo` hours before `now`. */
export function makeLot({
  farmer,
  now = new Date(),
  listedHoursAgo = 0,
  shelfLifeDays = 5,
  ...overrides
}) {
  const listedAt = new Date(now.getTime() - listedHoursAgo * HOUR);
  return Lot.create({
    code: randomCode('LOT'),
    farmer,
    produceSlug: 'tomato',
    hubCode: 'jashore',
    grade: 'A',
    defects: [],
    triageSource: 'rules',
    quantityKg: 100,
    remainingKg: 100,
    shelfLifeDays,
    listedAt,
    expiresAt: new Date(listedAt.getTime() + shelfLifeDays * 24 * HOUR),
    bazarPriceBdt: 70,
    farmerFloorBdt: 28,
    priceBdt: 56,
    status: 'listed',
    ...overrides,
  });
}
