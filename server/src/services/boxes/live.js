import { round2 } from '../pricing/policy.js';

const EPSILON = 1e-9;

/** Can this lot be sold right now? Works on database documents and plain objects. */
export function isSellableNow(lot, now = new Date()) {
  return lot.status === 'listed' && lot.remainingKg > 0 && new Date(lot.expiresAt) > now;
}

function sellableLotsOf(line, lotMap, now) {
  return line.lotCodes
    .map((code) => lotMap.get(code))
    .filter((lot) => lot && isSellableNow(lot, now));
}

/** Average price per kg across lots, weighted by the kilos each has left. */
export function weightedPricePerKg(lots) {
  const totalKg = lots.reduce((sum, lot) => sum + lot.remainingKg, 0);
  if (totalKg <= 0) return null;
  const totalValue = lots.reduce((sum, lot) => sum + lot.remainingKg * lot.priceBdt, 0);
  return round2(totalValue / totalKg);
}

export function lineStockKg(line, lotMap, now = new Date()) {
  return sellableLotsOf(line, lotMap, now).reduce((sum, lot) => sum + lot.remainingKg, 0);
}

export function lineUnits(line, lotMap, now = new Date()) {
  return Math.floor(lineStockKg(line, lotMap, now) / line.kgPerBox + EPSILON);
}

/** Boxes that can be sold right now: limited by the thinnest line. Never stored. */
export function availableUnits(box, lotMap, now = new Date()) {
  if (box.lines.length === 0) return 0;
  return Math.min(...box.lines.map((line) => lineUnits(line, lotMap, now)));
}

/** The current price of one box in whole taka, or null when a line has no stock. */
export function boxPriceBdt(box, lotMap, now = new Date()) {
  let total = 0;
  for (const line of box.lines) {
    const pricePerKg = weightedPricePerKg(sellableLotsOf(line, lotMap, now));
    if (pricePerKg === null) return null;
    total += line.kgPerBox * pricePerKg;
  }
  return Math.round(total);
}
