import {
  consumerFloorBdt,
  farmerFloorBdt,
  farmerPayoutBdt,
  maxDiscount,
  round2,
} from './policy.js';
import { isPeakMonth, spoilageRisk } from './risk.js';

/**
 * Markdown ladder: while the risk score is below `below`, the lot gets this discount
 * off the bazar price. Past the last step the price sits at the floor.
 */
export const MARKDOWN_LADDER = Object.freeze([
  { below: 0.25, discount: 0.2 },
  { below: 0.5, discount: 0.28 },
  { below: 0.75, discount: 0.36 },
]);

/**
 * Price one lot per kg.
 *   produce          { bazarPriceBdt, peakMonths }
 *   shelfLifeDays    the lot's own shelf life (from triage), not the catalog default
 *   hoursToExpiry    hours until it expires; zero or negative means expired
 *   grade            'A' | 'B' | 'C'
 *   currentPriceBdt  optional: the price now, so a price can only go down
 *
 * Whatever the inputs, the result is a whole-taka price between the consumer floor and
 * the bazar price, so the farmer's guaranteed floor can never be broken.
 */
export function priceLot({
  produce,
  shelfLifeDays,
  hoursToExpiry,
  grade,
  now = new Date(),
  currentPriceBdt,
}) {
  const bazar = produce.bazarPriceBdt;
  const risk = spoilageRisk({
    hoursToExpiry,
    shelfLifeDays,
    grade,
    inPeakSeason: isPeakMonth(produce, now),
  });

  const step = MARKDOWN_LADDER.find((s) => risk.score < s.below);
  const discount = step ? step.discount : maxDiscount();

  const floorBdt = farmerFloorBdt(bazar);
  const lowestBdt = consumerFloorBdt(bazar);

  let priceBdt = Math.round(bazar * (1 - discount));
  if (currentPriceBdt !== undefined) priceBdt = Math.min(priceBdt, currentPriceBdt);
  priceBdt = Math.min(priceBdt, Math.round(bazar));
  priceBdt = Math.max(priceBdt, lowestBdt); // the floor always wins

  return {
    priceBdt,
    discountPct: Math.round((1 - priceBdt / bazar) * 100),
    farmerFloorBdt: floorBdt,
    consumerFloorBdt: lowestBdt,
    farmerPayoutBdt: farmerPayoutBdt({ priceBdt, floorBdt }),
    riskScore: round2(risk.score),
    atFloor: priceBdt === lowestBdt,
  };
}
