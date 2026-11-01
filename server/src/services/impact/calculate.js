import { IMPACT_FACTORS } from '../../constants/impact.js';
import { round2 } from '../pricing/policy.js';

const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * What one delivered order achieved, worked out from the exact lot allocations it recorded.
 * `lotMap` (lot code -> lot) supplies each lot's bazar price. If a lot is missing, its
 * kilos count as sold at bazar price, so a saving is never claimed without evidence.
 */
export function orderImpact(order, lotMap) {
  let kg = 0;
  let bazarValue = 0;
  let paid = 0;

  for (const item of order.items) {
    for (const allocation of item.allocations) {
      const lot = lotMap.get(allocation.lotCode);
      kg += allocation.kg;
      paid += allocation.kg * allocation.pricePerKgBdt;
      bazarValue += allocation.kg * (lot?.bazarPriceBdt ?? allocation.pricePerKgBdt);
    }
  }

  const { co2eKgPerKgProduce, wasteShare } = IMPACT_FACTORS;
  return {
    kgRescued: round3(kg),
    bazarValueBdt: round2(bazarValue),
    paidBdt: round2(paid),
    savedBdt: round2(Math.max(0, bazarValue - paid)),
    co2eKg: round2(kg * co2eKgPerKgProduce * wasteShare),
  };
}

/** Add up several impacts (a customer's history, or the whole platform). */
export function sumImpacts(impacts) {
  const total = { kgRescued: 0, bazarValueBdt: 0, paidBdt: 0, savedBdt: 0, co2eKg: 0 };
  for (const impact of impacts) {
    for (const key of Object.keys(total)) total[key] += impact[key];
  }
  return {
    kgRescued: round3(total.kgRescued),
    bazarValueBdt: round2(total.bazarValueBdt),
    paidBdt: round2(total.paidBdt),
    savedBdt: round2(total.savedBdt),
    co2eKg: round2(total.co2eKg),
  };
}
