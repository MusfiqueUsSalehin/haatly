import { describe, expect, it } from 'vitest';
import { VEHICLES, VEHICLE_NAMES } from '../../src/constants/dispatch.js';
import { orderWeightKg } from '../../src/services/dispatch/orderWeight.js';
import { assignOrdersToRiders } from '../../src/services/routing/assignOrders.js';

const depot = { lat: 23.764, lng: 90.394 };
const zoneCenters = {
  'dhaka-mirpur': { lat: 23.8223, lng: 90.3654 },
  'dhaka-dhanmondi': { lat: 23.7461, lng: 90.3742 },
  'dhaka-gulshan': { lat: 23.7925, lng: 90.4078 },
};
const order = (code, zoneCode, weightKg = 6) => ({
  code,
  zoneCode,
  weightKg,
  ...zoneCenters[zoneCode],
});
const rider = (id, zoneCodes, capacityKg = 40) => ({ id, zoneCodes, capacityKg });
const run = (orders, riders) => assignOrdersToRiders({ orders, riders, zoneCenters, depot });
const codesFor = (result, id) => result.byRider.get(id).map((o) => o.code);

describe('assignOrdersToRiders', () => {
  it('gives an order to the rider who covers its zone', () => {
    const result = run(
      [order('o1', 'dhaka-mirpur'), order('o2', 'dhaka-dhanmondi')],
      [rider('R1', ['dhaka-mirpur']), rider('R2', ['dhaka-dhanmondi'])],
    );
    expect(codesFor(result, 'R1')).toEqual(['o1']);
    expect(codesFor(result, 'R2')).toEqual(['o2']);
    expect(result.offZoneCodes.size).toBe(0);
    expect(result.unassigned).toEqual([]);
  });

  it('shares a zone between riders who both cover it', () => {
    const orders = ['o1', 'o2', 'o3', 'o4'].map((code) => order(code, 'dhaka-mirpur'));
    const result = run(orders, [rider('R1', ['dhaka-mirpur']), rider('R2', ['dhaka-mirpur'])]);
    expect(codesFor(result, 'R1')).toEqual(['o1', 'o3']);
    expect(codesFor(result, 'R2')).toEqual(['o2', 'o4']);
  });

  it('balances by load relative to capacity, so a bigger vehicle takes more', () => {
    const orders = ['o1', 'o2', 'o3', 'o4'].map((code) => order(code, 'dhaka-mirpur', 10));
    const result = run(orders, [
      rider('R1', ['dhaka-mirpur'], 20),
      rider('R2', ['dhaka-mirpur'], 80),
    ]);
    expect(codesFor(result, 'R1')).toEqual(['o1']);
    expect(codesFor(result, 'R2')).toEqual(['o2', 'o3', 'o4']);
  });

  it('sends an order in an uncovered zone to the nearest rider and flags it off-zone', () => {
    // Gulshan is about 5.4 km from Mirpur and 6.2 km from Dhanmondi.
    const result = run(
      [order('g1', 'dhaka-gulshan')],
      [rider('R1', ['dhaka-mirpur']), rider('R2', ['dhaka-dhanmondi'])],
    );
    expect(codesFor(result, 'R1')).toEqual(['g1']);
    expect(result.offZoneCodes).toEqual(new Set(['g1']));
  });

  it('lets a rider with no zones take uncovered orders', () => {
    const result = run([order('g1', 'dhaka-gulshan')], [rider('R1', [])]);
    expect(codesFor(result, 'R1')).toEqual(['g1']);
    expect(result.offZoneCodes.has('g1')).toBe(true);
  });

  it('returns every order as unassigned when there are no riders', () => {
    const result = run([order('o1', 'dhaka-mirpur'), order('o2', 'dhaka-gulshan')], []);
    expect(result.unassigned).toEqual([
      { orderCode: 'o1', reason: 'no_riders' },
      { orderCode: 'o2', reason: 'no_riders' },
    ]);
  });

  it('places every order exactly once', () => {
    const orders = Array.from({ length: 9 }, (_, i) =>
      order(`o${i}`, Object.keys(zoneCenters)[i % 3], 3 + i),
    );
    const result = run(orders, [rider('R1', ['dhaka-mirpur']), rider('R2', [])]);
    const placed = [...result.byRider.values()].flat().map((o) => o.code);
    expect(placed.sort()).toEqual(orders.map((o) => o.code).sort());
  });
});

describe('orderWeightKg', () => {
  it('adds up every box times its quantity', () => {
    const items = [
      { qty: 2, lines: [{ kgPerBox: 1.5 }, { kgPerBox: 1.5 }] },
      { qty: 1, lines: [{ kgPerBox: 1 }, { kgPerBox: 1 }] },
    ];
    expect(orderWeightKg({ items })).toBe(8);
  });

  it('rounds away floating point noise', () => {
    expect(orderWeightKg({ items: [{ qty: 3, lines: [{ kgPerBox: 0.1 }] }] })).toBe(0.3);
  });
});

describe('vehicles', () => {
  it('describes a bike and a van, the van carrying more', () => {
    expect(VEHICLE_NAMES).toEqual(['bike', 'van']);
    expect(VEHICLES.van.capacityKg).toBeGreaterThan(VEHICLES.bike.capacityKg);
    expect(VEHICLES.van.maxStops).toBeGreaterThan(VEHICLES.bike.maxStops);
    expect(Object.isFrozen(VEHICLES.bike)).toBe(true);
  });
});
