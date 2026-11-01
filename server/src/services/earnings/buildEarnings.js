import { round2, splitRevenue } from '../pricing/policy.js';

const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Work out what each farmer earned from a delivered order. Pure. One entry per lot.
 *   order  a delivered order, with items[].allocations[] and a deliveredAt time
 *   lots   the lots it drew from: each needs { code, farmer, farmerFloorBdt }
 *
 * Every allocation is split with the payout policy using the price it was sold at and the
 * floor the lot was listed with, and the results are added up per lot. A missing lot is an
 * error, never a guess: money records must not be invented.
 */
export function buildEarnings({ order, lots }) {
  if (!order.deliveredAt) throw new Error('earnings are only recorded for delivered orders');
  const lotMap = new Map(lots.map((lot) => [lot.code, lot]));
  const byLot = new Map();

  for (const item of order.items) {
    for (const allocation of item.allocations) {
      const lot = lotMap.get(allocation.lotCode);
      if (!lot) throw new Error(`lot ${allocation.lotCode} is missing`);

      const { revenueBdt, farmerBdt } = splitRevenue({
        priceBdt: allocation.pricePerKgBdt,
        kg: allocation.kg,
        floorBdt: lot.farmerFloorBdt,
      });
      const entry = byLot.get(lot.code) ?? {
        farmer: lot.farmer,
        orderCode: order.code,
        lotCode: lot.code,
        produceSlug: allocation.produceSlug,
        kg: 0,
        floorBdt: lot.farmerFloorBdt,
        revenueBdt: 0,
        farmerBdt: 0,
        deliveredAt: order.deliveredAt,
      };
      entry.kg += allocation.kg;
      entry.revenueBdt += revenueBdt;
      entry.farmerBdt += farmerBdt;
      byLot.set(lot.code, entry);
    }
  }

  return [...byLot.values()]
    .map((entry) => {
      const revenueBdt = round2(entry.revenueBdt);
      const farmerBdt = round2(entry.farmerBdt);
      return {
        ...entry,
        kg: round3(entry.kg),
        pricePerKgBdt: round2(revenueBdt / round3(entry.kg)),
        revenueBdt,
        farmerBdt,
        platformBdt: round2(revenueBdt - farmerBdt),
      };
    })
    .sort((a, b) => a.lotCode.localeCompare(b.lotCode));
}

/** Totals for a list of ledger entries (a farmer's earnings, or the whole platform's). */
export function summarizeEarnings(entries) {
  const totals = { kg: 0, revenueBdt: 0, farmerBdt: 0, platformBdt: 0, unpaidBdt: 0, paidBdt: 0 };
  for (const entry of entries) {
    totals.kg += entry.kg;
    totals.revenueBdt += entry.revenueBdt;
    totals.farmerBdt += entry.farmerBdt;
    totals.platformBdt += entry.platformBdt;
    totals[entry.status === 'paid' ? 'paidBdt' : 'unpaidBdt'] += entry.farmerBdt;
  }
  return {
    kg: round3(totals.kg),
    revenueBdt: round2(totals.revenueBdt),
    farmerBdt: round2(totals.farmerBdt),
    platformBdt: round2(totals.platformBdt),
    unpaidBdt: round2(totals.unpaidBdt),
    paidBdt: round2(totals.paidBdt),
    orders: new Set(entries.map((entry) => entry.orderCode)).size,
    entries: entries.length,
  };
}
