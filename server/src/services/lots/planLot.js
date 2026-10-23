import { LOT_STATUS } from '../../models/Lot.js';
import { AppError } from '../../utils/AppError.js';
import { priceLot } from '../pricing/pricing.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Turn a crate grading into the fields of a new lot. Pure: no database, no clock
 * (pass `now`). The farmer never supplies grade, shelf life, price or expiry.
 */
export function planLot({ produce, triage, triageSource, quantityKg, now = new Date() }) {
  if (!triage.sellable) {
    throw new AppError(422, 'not_sellable', 'This crate cannot be sold', {
      defects: triage.defects,
    });
  }

  // Grading already respects the catalog, but the cap is enforced again here.
  const shelfLifeDays = Math.min(triage.shelfLifeDays, produce.shelfLifeDays);

  const quote = priceLot({
    produce: { bazarPriceBdt: produce.bazarPriceBdt, peakMonths: produce.peakMonths },
    shelfLifeDays,
    hoursToExpiry: shelfLifeDays * 24,
    grade: triage.grade,
    now,
  });

  return {
    quote,
    fields: {
      produceSlug: produce.slug,
      grade: triage.grade,
      defects: [...triage.defects],
      triageSource,
      quantityKg,
      remainingKg: quantityKg,
      shelfLifeDays,
      listedAt: now,
      expiresAt: new Date(now.getTime() + shelfLifeDays * DAY_MS),
      bazarPriceBdt: produce.bazarPriceBdt,
      farmerFloorBdt: quote.farmerFloorBdt,
      priceBdt: quote.priceBdt,
      status: LOT_STATUS.LISTED,
    },
  };
}
