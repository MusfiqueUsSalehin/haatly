import { describe, expect, it } from 'vitest';
import { distanceKm, pathLengthKm } from '../../src/services/routing/geo.js';

const DEGREE_KM = 111.19;
const dhaka = { lat: 23.8103, lng: 90.4125 };
const cumilla = { lat: 23.4607, lng: 91.1809 };
const chattogram = { lat: 22.3569, lng: 91.7832 };

describe('distanceKm', () => {
  it('is zero between a point and itself', () => {
    expect(distanceKm(dhaka, dhaka)).toBe(0);
  });

  it('is about 111.19 km per degree of latitude', () => {
    expect(distanceKm({ lat: 23, lng: 90 }, { lat: 24, lng: 90 })).toBeCloseTo(DEGREE_KM, 1);
  });

  it('shrinks east-west distances as you move away from the equator', () => {
    expect(distanceKm({ lat: 0, lng: 90 }, { lat: 0, lng: 91 })).toBeCloseTo(DEGREE_KM, 1);
    expect(distanceKm({ lat: 60, lng: 90 }, { lat: 60, lng: 91 })).toBeCloseTo(55.6, 0);
  });

  it('gives the same distance in both directions', () => {
    expect(distanceKm(dhaka, chattogram)).toBeCloseTo(distanceKm(chattogram, dhaka), 9);
  });

  it('puts Dhaka and Chattogram a little over 200 km apart in a straight line', () => {
    const km = distanceKm(dhaka, chattogram);
    expect(km).toBeGreaterThan(200);
    expect(km).toBeLessThan(225);
  });

  it('never makes a detour shorter than the direct route', () => {
    const direct = distanceKm(dhaka, chattogram);
    expect(direct).toBeLessThanOrEqual(
      distanceKm(dhaka, cumilla) + distanceKm(cumilla, chattogram),
    );
  });
});

describe('pathLengthKm', () => {
  const depot = { lat: 23, lng: 90 };

  it('is zero with no stops', () => {
    expect(pathLengthKm(depot, [])).toBe(0);
  });

  it('counts the way back to the depot unless the trip is open', () => {
    const stops = [{ lat: 24, lng: 90 }];
    expect(pathLengthKm(depot, stops)).toBeCloseTo(2 * DEGREE_KM, 1);
    expect(pathLengthKm(depot, stops, { closed: false })).toBeCloseTo(DEGREE_KM, 1);
  });

  it('adds up every leg in order', () => {
    const stops = [
      { lat: 24, lng: 90 },
      { lat: 25, lng: 90 },
    ];
    expect(pathLengthKm(depot, stops)).toBeCloseTo(4 * DEGREE_KM, 1);
    expect(pathLengthKm(depot, stops, { closed: false })).toBeCloseTo(2 * DEGREE_KM, 1);
  });
});
