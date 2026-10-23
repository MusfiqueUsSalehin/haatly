import { farmerPayoutBdt } from '../pricing/policy.js';

const HOUR_MS = 60 * 60 * 1000;

/** A lot as the farmer sees it: the stored fields plus sold kilos, time left and payout. */
export function describeLot(lot, now = new Date()) {
  const hoursLeft = (new Date(lot.expiresAt) - now) / HOUR_MS;
  return {
    ...lot.toJSON(),
    soldKg: lot.quantityKg - lot.remainingKg,
    hoursToExpiry: Math.max(0, Math.round(hoursLeft * 10) / 10),
    // What the farmer is paid per kg at the lot's current price (never below the floor).
    farmerPayoutPerKgBdt: farmerPayoutBdt({
      priceBdt: lot.priceBdt,
      floorBdt: lot.farmerFloorBdt,
    }),
  };
}
