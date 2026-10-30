import { distanceKm } from './geo.js';

/**
 * Decide which rider takes each order. Pure.
 *   orders  { code, zoneCode, lat, lng, weightKg }
 *   riders  { id, zoneCodes, capacityKg }
 *   zoneCenters  { zoneCode: { lat, lng } }
 *
 * Orders in a zone some rider covers go to a covering rider, the one carrying the least
 * relative to their capacity (heaviest orders first, so the load stays balanced). Orders
 * in a zone nobody covers go to the rider whose zones are nearest, and are flagged
 * off-zone. Riders with no zones are measured from the depot.
 */
export function assignOrdersToRiders({ orders, riders, zoneCenters, depot }) {
  const byRider = new Map(riders.map((rider) => [rider.id, []]));
  const load = new Map(riders.map((rider) => [rider.id, 0]));
  const offZoneCodes = new Set();

  if (riders.length === 0) {
    const unassigned = orders.map((order) => ({ orderCode: order.code, reason: 'no_riders' }));
    return { byRider, unassigned, offZoneCodes };
  }

  const distanceToRider = (rider, order) => {
    const centers = rider.zoneCodes.map((code) => zoneCenters[code]).filter(Boolean);
    if (centers.length === 0) return distanceKm(depot, order);
    return Math.min(...centers.map((center) => distanceKm(center, order)));
  };
  const loadRatio = (rider) => load.get(rider.id) / rider.capacityKg;

  const sorted = [...orders].sort(
    (a, b) => b.weightKg - a.weightKg || a.code.localeCompare(b.code),
  );

  for (const order of sorted) {
    const covering = riders.filter((rider) => rider.zoneCodes.includes(order.zoneCode));
    const pool = covering.length > 0 ? covering : riders;

    const [pick] = [...pool].sort(
      (a, b) =>
        (covering.length > 0 ? 0 : distanceToRider(a, order) - distanceToRider(b, order)) ||
        loadRatio(a) - loadRatio(b) ||
        a.id.localeCompare(b.id),
    );

    byRider.get(pick.id).push(order);
    load.set(pick.id, load.get(pick.id) + order.weightKg);
    if (covering.length === 0) offZoneCodes.add(order.code);
  }

  return { byRider, unassigned: [], offZoneCodes };
}
