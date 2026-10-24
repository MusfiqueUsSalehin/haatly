import { BOX_TIERS, TIERS_BY_SHARE } from '../../constants/boxes.js';
import { isSellableNow } from './live.js';

const HOUR_MS = 60 * 60 * 1000;

/** A lot must still have this many hours of shelf life left after the truck trip. */
export const MIN_HOURS_AFTER_TRUCK = 24;

/**
 * Send every sellable lot to ONE city: the nearest one it can still reach fresh.
 * Because each lot goes to exactly one place, two cities can never sell the same kilos.
 * Returns { byCity, skipped } where skipped says why a lot was left out.
 */
export function assignLotsToCities({
  lots,
  hubs,
  cityCodes,
  now = new Date(),
  minHoursAfterTruck = MIN_HOURS_AFTER_TRUCK,
}) {
  const hubByCode = new Map(hubs.map((hub) => [hub.code, hub]));
  const allowed = cityCodes ? new Set(cityCodes) : null;
  const byCity = Object.fromEntries((cityCodes ?? []).map((code) => [code, []]));
  const skipped = [];

  for (const lot of lots) {
    if (!isSellableNow(lot, now)) {
      skipped.push({ lotCode: lot.code, reason: 'not_sellable' });
      continue;
    }
    const hub = hubByCode.get(lot.hubCode);
    if (!hub || hub.kind !== 'collection' || hub.active === false) {
      skipped.push({ lotCode: lot.code, reason: 'unknown_hub' });
      continue;
    }

    const hoursLeft = (new Date(lot.expiresAt) - now) / HOUR_MS;
    const reachable = hub.serves
      .filter(
        (route) =>
          (!allowed || allowed.has(route.cityCode)) &&
          hoursLeft - route.truckHours >= minHoursAfterTruck,
      )
      .sort((a, b) => a.truckHours - b.truckHours || a.cityCode.localeCompare(b.cityCode));

    if (reachable.length === 0) {
      skipped.push({ lotCode: lot.code, reason: 'no_reachable_city' });
      continue;
    }
    (byCity[reachable[0].cityCode] ??= []).push(lot);
  }

  return { byCity, skipped };
}

/**
 * Split one city's lots between the box sizes, each lot going whole to ONE size.
 * Biggest lots first. Each lot goes to a size that does not stock that produce yet (so
 * every size gets variety), then to the size furthest below its target share.
 */
export function splitByTier(lots) {
  const totals = Object.fromEntries(TIERS_BY_SHARE.map((tier) => [tier, 0]));
  const produceIn = Object.fromEntries(TIERS_BY_SHARE.map((tier) => [tier, new Set()]));
  const out = Object.fromEntries(TIERS_BY_SHARE.map((tier) => [tier, []]));

  const sorted = [...lots].sort(
    (a, b) => b.remainingKg - a.remainingKg || a.code.localeCompare(b.code),
  );

  for (const lot of sorted) {
    const ranked = TIERS_BY_SHARE.map((tier) => ({
      tier,
      alreadyHasProduce: produceIn[tier].has(lot.produceSlug),
      fill: totals[tier] / BOX_TIERS[tier].share,
    })).sort(
      (a, b) => Number(a.alreadyHasProduce) - Number(b.alreadyHasProduce) || a.fill - b.fill,
    );

    const { tier } = ranked[0];
    out[tier].push(lot);
    totals[tier] += lot.remainingKg;
    produceIn[tier].add(lot.produceSlug);
  }
  return out;
}
