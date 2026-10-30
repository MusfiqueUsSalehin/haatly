import { pathLengthKm } from './geo.js';
import { assignOrdersToRiders } from './assignOrders.js';
import { orderStops } from './route.js';

const round1 = (n) => Math.round(n * 10) / 10;
const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Plan delivery runs. Pure.
 *   depot        { lat, lng } where every trip starts and ends
 *   orders       { code, zoneCode, lat, lng, weightKg }   (lat/lng is the zone centre)
 *   riders       { id, zoneCodes, capacityKg, maxStops }
 *   zoneCenters  { zoneCode: { lat, lng } }
 *
 * Returns { runs, unassigned }. Every order is in exactly one run or in `unassigned`
 * with a reason (no_riders, too_heavy): none is ever silently dropped. A rider with too
 * much for one trip gets several trips (trip 1, 2, ...), each within their limits.
 */
export function planRuns({ depot, orders, riders, zoneCenters }) {
  const sortedRiders = [...riders].sort((a, b) => a.id.localeCompare(b.id));
  const assignment = assignOrdersToRiders({ orders, riders: sortedRiders, zoneCenters, depot });
  const unassigned = [...assignment.unassigned];
  const runs = [];

  for (const rider of sortedRiders) {
    const fits = [];
    for (const order of assignment.byRider.get(rider.id)) {
      if (order.weightKg > rider.capacityKg) {
        unassigned.push({ orderCode: order.code, reason: 'too_heavy' });
      } else {
        fits.push(order);
      }
    }

    // One tour over everything this rider has, then cut it into trips along the way.
    const trips = [];
    let current = [];
    let weight = 0;
    for (const stop of orderStops(depot, fits)) {
      const full = weight + stop.weightKg > rider.capacityKg || current.length >= rider.maxStops;
      if (current.length > 0 && full) {
        trips.push(current);
        current = [];
        weight = 0;
      }
      current.push(stop);
      weight += stop.weightKg;
    }
    if (current.length > 0) trips.push(current);

    trips.forEach((trip, index) => {
      const stops = orderStops(depot, trip);
      runs.push({
        riderId: rider.id,
        trip: index + 1,
        stops: stops.map(({ code, zoneCode, weightKg }) => ({
          orderCode: code,
          zoneCode,
          weightKg,
        })),
        weightKg: round3(stops.reduce((sum, stop) => sum + stop.weightKg, 0)),
        distanceKm: round1(pathLengthKm(depot, stops)),
        offZoneStops: stops.filter((stop) => assignment.offZoneCodes.has(stop.code)).length,
      });
    });
  }

  return { runs, unassigned };
}
