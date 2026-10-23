import { LOT_STATUS, Lot, sellableFilter } from '../../models/Lot.js';
import { Produce } from '../../models/Produce.js';
import { priceLot } from '../pricing/pricing.js';

const HOUR_MS = 60 * 60 * 1000;

/** Mark every listed lot whose time is up as expired. Returns how many changed. */
export async function expireLots(now = new Date()) {
  const { modifiedCount } = await Lot.updateMany(
    { status: LOT_STATUS.LISTED, expiresAt: { $lte: now } },
    { status: LOT_STATUS.EXPIRED },
  );
  return modifiedCount;
}

/**
 * Mark prices down on lots that are still on sale. Each lot is priced from its own
 * listing-time bazar price (so its farmer floor never moves) and can only go down.
 */
export async function repriceLots(now = new Date()) {
  const filter = sellableFilter(now);
  const slugs = await Lot.distinct('produceSlug', filter);
  const produce = await Produce.find({ slug: { $in: slugs } });
  const seasons = new Map(produce.map((p) => [p.slug, p.peakMonths]));

  let checked = 0;
  let repriced = 0;
  for await (const lot of Lot.find(filter).cursor()) {
    checked += 1;
    const { priceBdt } = priceLot({
      produce: { bazarPriceBdt: lot.bazarPriceBdt, peakMonths: seasons.get(lot.produceSlug) ?? [] },
      shelfLifeDays: lot.shelfLifeDays,
      hoursToExpiry: (lot.expiresAt - now) / HOUR_MS,
      grade: lot.grade,
      now,
      currentPriceBdt: lot.priceBdt,
    });
    if (priceBdt >= lot.priceBdt) continue;

    // Only write if the price is still what we read, so a concurrent change is not lost.
    const { modifiedCount } = await Lot.updateOne(
      { _id: lot._id, status: LOT_STATUS.LISTED, priceBdt: lot.priceBdt },
      { priceBdt },
    );
    repriced += modifiedCount;
  }
  return { checked, repriced };
}

/** The hourly job: expire first, so expired lots are never repriced. */
export async function runLotMaintenance(now = new Date()) {
  const expired = await expireLots(now);
  const { checked, repriced } = await repriceLots(now);
  return { expired, checked, repriced };
}
