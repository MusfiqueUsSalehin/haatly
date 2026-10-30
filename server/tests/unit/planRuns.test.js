import { describe, expect, it } from 'vitest';
import { planRuns } from '../../src/services/routing/planRuns.js';

const depot = { lat: 23.764, lng: 90.394 };
const zoneCenters = {
  'dhaka-mirpur': { lat: 23.8223, lng: 90.3654 },
  'dhaka-uttara': { lat: 23.8759, lng: 90.3795 },
  'dhaka-dhanmondi': { lat: 23.7461, lng: 90.3742 },
  'dhaka-gulshan': { lat: 23.7925, lng: 90.4078 },
};
const order = (code, zoneCode, weightKg = 6) => ({
  code,
  zoneCode,
  weightKg,
  ...zoneCenters[zoneCode],
});
const rider = (id, zoneCodes, capacityKg = 40, maxStops = 12) => ({
  id,
  zoneCodes,
  capacityKg,
  maxStops,
});
const plan = (orders, riders) => planRuns({ depot, orders, riders, zoneCenters });
const codesOf = (run) => run.stops.map((stop) => stop.orderCode);

const R1 = rider('R1', ['dhaka-mirpur', 'dhaka-uttara']);
const R2 = rider('R2', ['dhaka-dhanmondi', 'dhaka-gulshan']);

describe('planRuns', () => {
  it('gives each rider one trip for the zones they cover', () => {
    const orders = [
      order('o1', 'dhaka-mirpur'),
      order('o2', 'dhaka-mirpur'),
      order('o3', 'dhaka-uttara'),
      order('o4', 'dhaka-dhanmondi'),
      order('o5', 'dhaka-gulshan'),
      order('o6', 'dhaka-gulshan'),
    ];
    const { runs, unassigned } = plan(orders, [R1, R2]);

    expect(unassigned).toEqual([]);
    expect(runs).toHaveLength(2);

    const first = runs.find((r) => r.riderId === 'R1');
    expect(first).toMatchObject({ trip: 1, weightKg: 18, offZoneStops: 0 });
    expect(codesOf(first)).toEqual(['o1', 'o2', 'o3']);
    expect(first.distanceKm).toBeCloseTo(25.8, 0);

    const second = runs.find((r) => r.riderId === 'R2');
    expect(second).toMatchObject({ trip: 1, weightKg: 18 });
    expect(codesOf(second).sort()).toEqual(['o4', 'o5', 'o6']);
  });

  it('turns a rider with too much weight into extra trips instead of dropping stops', () => {
    const orders = [
      order('p1', 'dhaka-mirpur'),
      order('p2', 'dhaka-mirpur'),
      order('p3', 'dhaka-uttara'),
      order('p4', 'dhaka-uttara'),
    ];
    const { runs, unassigned } = plan(orders, [rider('R1', [...R1.zoneCodes], 15)]);

    expect(unassigned).toEqual([]);
    expect(runs.map((r) => [r.trip, codesOf(r), r.weightKg])).toEqual([
      [1, ['p1', 'p2'], 12],
      [2, ['p3', 'p4'], 12],
    ]);
  });

  it('splits a long trip when it has more stops than the rider is allowed', () => {
    const orders = ['p1', 'p2', 'p3', 'p4', 'p5'].map((code) => order(code, 'dhaka-mirpur', 1));
    const { runs } = plan(orders, [rider('R1', ['dhaka-mirpur'], 200, 2)]);
    expect(runs.map((r) => codesOf(r))).toEqual([['p1', 'p2'], ['p3', 'p4'], ['p5']]);
  });

  it('lists an order too heavy for the rider as unassigned and still plans the rest', () => {
    const { runs, unassigned } = plan(
      [order('big', 'dhaka-mirpur', 50), order('s1', 'dhaka-mirpur')],
      [rider('R1', ['dhaka-mirpur'], 40)],
    );
    expect(unassigned).toEqual([{ orderCode: 'big', reason: 'too_heavy' }]);
    expect(runs).toHaveLength(1);
    expect(codesOf(runs[0])).toEqual(['s1']);
  });

  it('plans nothing and explains why when there are no riders', () => {
    const { runs, unassigned } = plan([order('o1', 'dhaka-mirpur')], []);
    expect(runs).toEqual([]);
    expect(unassigned).toEqual([{ orderCode: 'o1', reason: 'no_riders' }]);
  });

  it('counts stops outside the rider zones', () => {
    const { runs } = plan([order('g1', 'dhaka-gulshan')], [rider('R1', ['dhaka-mirpur'])]);
    expect(runs[0].offZoneStops).toBe(1);
  });

  it('places every order exactly once and keeps every trip within its limits', () => {
    const zones = Object.keys(zoneCenters);
    const weights = [3, 5, 8, 13, 4, 7, 9, 2, 11, 6];
    const orders = weights.map((kg, i) => order(`o${i}`, zones[i % 4], kg));
    const riders = [
      rider('R1', ['dhaka-mirpur', 'dhaka-uttara'], 20, 3),
      rider('R2', ['dhaka-dhanmondi'], 20, 3),
      rider('R3', [], 40, 25),
    ];

    const { runs, unassigned } = plan(orders, riders);
    const placed = [...runs.flatMap(codesOf), ...unassigned.map((u) => u.orderCode)];
    expect(placed.sort()).toEqual(orders.map((o) => o.code).sort());

    for (const run of runs) {
      const limits = riders.find((r) => r.id === run.riderId);
      expect(run.weightKg).toBeLessThanOrEqual(limits.capacityKg);
      expect(run.stops.length).toBeLessThanOrEqual(limits.maxStops);
    }
  });

  it('numbers each rider trips from one with no gaps', () => {
    const orders = Array.from({ length: 7 }, (_, i) => order(`p${i}`, 'dhaka-mirpur', 6));
    const { runs } = plan(orders, [rider('R1', ['dhaka-mirpur'], 15)]);
    expect(runs.map((r) => r.trip)).toEqual([1, 2, 3, 4]);
  });

  it('gives the same plan whatever order the orders arrive in', () => {
    const orders = [
      order('o1', 'dhaka-mirpur'),
      order('o2', 'dhaka-uttara'),
      order('o3', 'dhaka-gulshan'),
      order('o4', 'dhaka-dhanmondi'),
    ];
    expect(plan([...orders].reverse(), [R2, R1])).toEqual(plan(orders, [R1, R2]));
  });
});
