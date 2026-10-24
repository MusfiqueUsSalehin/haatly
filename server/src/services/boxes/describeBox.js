import { availableUnits, boxPriceBdt } from './live.js';

const savingsPct = (price, bazarValue) => Math.max(0, Math.round((1 - price / bazarValue) * 100));

/** A box as customers see it, with units and price worked out from the live lots. */
export function describeBox(box, lotMap, produceBySlug, now = new Date()) {
  const unitsAvailable = availableUnits(box, lotMap, now);
  const soldOut = unitsAvailable === 0;
  const priceBdt = soldOut ? null : boxPriceBdt(box, lotMap, now);
  const bazarValueBdt = Math.round(
    box.lines.reduce(
      (sum, line) => sum + line.kgPerBox * (produceBySlug[line.produceSlug]?.bazarPriceBdt ?? 0),
      0,
    ),
  );

  return {
    code: box.code,
    cityCode: box.cityCode,
    tier: box.tier,
    date: box.date,
    weightKg: box.weightKg,
    unitsAvailable,
    soldOut,
    priceBdt,
    bazarValueBdt,
    savingsPct: priceBdt && bazarValueBdt ? savingsPct(priceBdt, bazarValueBdt) : null,
    lines: box.lines.map((line) => ({
      produceSlug: line.produceSlug,
      nameEn: produceBySlug[line.produceSlug]?.nameEn ?? line.produceSlug,
      nameBn: produceBySlug[line.produceSlug]?.nameBn ?? line.produceSlug,
      kgPerBox: line.kgPerBox,
    })),
  };
}
