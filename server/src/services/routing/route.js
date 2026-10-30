import { distanceKm, pathLengthKm } from './geo.js';

const EPSILON = 1e-9;

/** Always visit the closest unvisited stop next. Ties go to the lower stop code. */
export function nearestNeighbourRoute(depot, stops) {
  const remaining = [...stops].sort((a, b) => a.code.localeCompare(b.code));
  const route = [];
  let here = depot;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    remaining.forEach((stop, index) => {
      const distance = distanceKm(here, stop);
      if (distance < bestDistance - EPSILON) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    const [next] = remaining.splice(bestIndex, 1);
    route.push(next);
    here = next;
  }
  return route;
}

/**
 * Put the stops of one trip in a short visiting order (depot -> stops -> depot).
 * Starts from nearest-neighbour, then 2-opt: keep reversing a stretch of the route while
 * that makes the trip strictly shorter. Deterministic, and fine for the few dozen stops
 * a rider carries. Each stop needs { code, lat, lng }.
 */
export function orderStops(depot, stops) {
  let route = nearestNeighbourRoute(depot, stops);
  let best = pathLengthKm(depot, route);
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const candidate = [
          ...route.slice(0, i),
          ...route.slice(i, j + 1).reverse(),
          ...route.slice(j + 1),
        ];
        const length = pathLengthKm(depot, candidate);
        if (length < best - EPSILON) {
          route = candidate;
          best = length;
          improved = true;
        }
      }
    }
  }
  return route;
}
