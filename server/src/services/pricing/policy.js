/**
 * The money rules, in one place. Change a number here and everything that prices a
 * lot or settles an order follows.
 *
 *   farmerShare       share of the consumer price the farmer receives; the rest
 *                     covers delivery, hubs and running the platform
 *   farmerFloorRatio  the farmer is guaranteed at least this share of the kacha-bazar
 *                     price per kg, whatever the discount
 *
 * These are starting estimates. Tune them from real delivery costs.
 */
export const PRICING_POLICY = Object.freeze({
  farmerShare: 0.72,
  farmerFloorRatio: 0.4,
});

export const round2 = (n) => Math.round(n * 100) / 100;

/** The guaranteed minimum the farmer is paid per kg, worked out from the bazar price. */
export function farmerFloorBdt(bazarPriceBdt) {
  return round2(bazarPriceBdt * PRICING_POLICY.farmerFloorRatio);
}

/**
 * The lowest consumer price (whole taka per kg) at which the farmer's share still
 * covers the floor. The small epsilon stops float noise from adding a spare taka.
 */
export function consumerFloorBdt(bazarPriceBdt) {
  return Math.ceil(farmerFloorBdt(bazarPriceBdt) / PRICING_POLICY.farmerShare - 1e-9);
}

/** The biggest discount from the bazar price that still protects the farmer (about 0.44). */
export function maxDiscount() {
  return 1 - PRICING_POLICY.farmerFloorRatio / PRICING_POLICY.farmerShare;
}

/** What the farmer is paid per kg at a consumer price. Never below the floor. */
export function farmerPayoutBdt({ priceBdt, floorBdt }) {
  return Math.max(round2(priceBdt * PRICING_POLICY.farmerShare), floorBdt);
}

/**
 * Split the money for a sale. platformBdt goes negative when the farmer's floor has to
 * be topped up from the platform's own margin: the farmer is never the one who loses.
 */
export function splitRevenue({ priceBdt, kg, floorBdt }) {
  const revenueBdt = round2(priceBdt * kg);
  const farmerBdt = round2(farmerPayoutBdt({ priceBdt, floorBdt }) * kg);
  return { revenueBdt, farmerBdt, platformBdt: round2(revenueBdt - farmerBdt) };
}
