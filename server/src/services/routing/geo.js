const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

/** Straight-line (great-circle) distance in km between two { lat, lng } points. */
export function distanceKm(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of the trip depot -> stops in order (and back to the depot when closed). */
export function pathLengthKm(depot, stops, { closed = true } = {}) {
  if (stops.length === 0) return 0;
  let total = distanceKm(depot, stops[0]);
  for (let i = 1; i < stops.length; i++) total += distanceKm(stops[i - 1], stops[i]);
  if (closed) total += distanceKm(stops.at(-1), depot);
  return total;
}
