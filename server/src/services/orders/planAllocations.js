import { AppError } from '../../utils/AppError.js';
import { boxPriceBdt, isSellableNow } from '../boxes/live.js';

const EPSILON = 1e-9;
const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Decide which kilos of which lots fill `qty` boxes. Pure: it reads the lots it is given
 * and reserves nothing. Lots are used in the order the recipe lists them (most urgent
 * first). Returns the allocations and the price one box costs right now.
 */
export function planAllocations({ box, qty, lotMap, now = new Date() }) {
  const allocations = [];

  for (const line of box.lines) {
    let neededKg = round3(qty * line.kgPerBox);

    for (const code of line.lotCodes) {
      if (neededKg <= EPSILON) break;
      const lot = lotMap.get(code);
      if (!lot || !isSellableNow(lot, now)) continue;

      const kg = round3(Math.min(neededKg, lot.remainingKg));
      if (kg <= EPSILON) continue;
      allocations.push({
        lotCode: lot.code,
        produceSlug: line.produceSlug,
        kg,
        pricePerKgBdt: lot.priceBdt,
      });
      neededKg = round3(neededKg - kg);
    }

    if (neededKg > EPSILON) {
      throw new AppError(409, 'insufficient_stock', 'Not enough stock for this box', {
        boxCode: box.code,
        produceSlug: line.produceSlug,
        missingKg: neededKg,
      });
    }
  }

  return { allocations, unitPriceBdt: boxPriceBdt(box, lotMap, now) };
}
