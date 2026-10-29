import { describe, expect, it } from 'vitest';
import { pathLengthKm } from '../../src/services/routing/geo.js';
import { nearestNeighbourRoute, orderStops } from '../../src/services/routing/route.js';

const depot = { lat: 23, lng: 90 };
const stop = (code, lat, lng) => ({ code, lat, lng });
const codes = (route) => route.map((s) => s.code);

describe('orderStops', () => {
  it('handles no stops and one stop', () => {
    expect(orderStops(depot, [])).toEqual([]);
    expect(codes(orderStops(depot, [stop('a', 23.1, 90)]))).toEqual(['a']);
  });

  it('visits stops on a line from nearest to farthest', () => {
    const route = orderStops(depot, [
      stop('c', 23.3, 90),
      stop('a', 23.1, 90),
      stop('b', 23.2, 90),
    ]);
    expect(codes(route)).toEqual(['a', 'b', 'c']);
  });

  it('drives around the edge of a square instead of cutting across it', () => {
    const route = orderStops(depot, [
      stop('ne', 23.1, 90.1),
      stop('n', 23.1, 90),
      stop('e', 23, 90.1),
    ]);
    expect(codes(route)).toEqual(['e', 'ne', 'n']);
  });

  it('is never longer than the nearest-neighbour route it started from', () => {
    const stops = Array.from({ length: 8 }, (_, i) =>
      stop(`s${i}`, 23 + ((i * 37) % 11) / 100, 90 + ((i * 53) % 13) / 100),
    );
    const optimised = pathLengthKm(depot, orderStops(depot, stops));
    const starting = pathLengthKm(depot, nearestNeighbourRoute(depot, stops));
    expect(optimised).toBeLessThanOrEqual(starting + 1e-9);
  });

  it('visits every stop exactly once', () => {
    const stops = Array.from({ length: 8 }, (_, i) =>
      stop(`s${i}`, 23 + ((i * 37) % 11) / 100, 90 + ((i * 53) % 13) / 100),
    );
    expect(codes(orderStops(depot, stops)).sort()).toEqual(codes(stops).sort());
  });

  it('gives the same answer whatever order the stops arrive in', () => {
    const stops = Array.from({ length: 8 }, (_, i) =>
      stop(`s${i}`, 23 + ((i * 37) % 11) / 100, 90 + ((i * 53) % 13) / 100),
    );
    expect(codes(orderStops(depot, [...stops].reverse()))).toEqual(codes(orderStops(depot, stops)));
  });

  it('keeps stops at the same place in code order', () => {
    const route = orderStops(depot, [
      stop('c', 23.1, 90),
      stop('a', 23.1, 90),
      stop('b', 23.1, 90),
    ]);
    expect(codes(route)).toEqual(['a', 'b', 'c']);
  });

  it('does not change the list it is given', () => {
    const stops = [stop('b', 23.2, 90), stop('a', 23.1, 90)];
    orderStops(depot, stops);
    expect(codes(stops)).toEqual(['b', 'a']);
  });
});
