import { describe, expect, it } from 'vitest';
import { assignLotsToCities, splitByTier } from '../../src/services/boxes/assignStock.js';

const NOW = new Date('2026-10-17T06:00:00Z');
const HOUR = 3600 * 1000;

const hubs = [
  {
    code: 'jashore',
    kind: 'collection',
    active: true,
    serves: [
      { cityCode: 'dhaka', truckHours: 5 },
      { cityCode: 'chattogram', truckHours: 9.5 },
    ],
  },
  {
    code: 'cumilla',
    kind: 'collection',
    active: true,
    serves: [
      { cityCode: 'dhaka', truckHours: 3 },
      { cityCode: 'chattogram', truckHours: 3.5 },
    ],
  },
  {
    code: 'hathazari',
    kind: 'collection',
    active: true,
    serves: [{ cityCode: 'chattogram', truckHours: 1 }],
  },
  { code: 'dhaka-depot', kind: 'depot', active: true, cityCode: 'dhaka', serves: [] },
];

const lot = (code, hubCode, hoursLeft, overrides) => ({
  code,
  hubCode,
  produceSlug: 'tomato',
  remainingKg: 100,
  priceBdt: 50,
  status: 'listed',
  expiresAt: new Date(NOW.getTime() + hoursLeft * HOUR),
  ...overrides,
});
const codes = (list) => list.map((l) => l.code);
const assign = (lots, extra = {}) => assignLotsToCities({ lots, hubs, now: NOW, ...extra });

describe('assignLotsToCities', () => {
  it('sends each lot to the nearest city it can reach fresh', () => {
    const { byCity, skipped } = assign([
      lot('A', 'cumilla', 100),
      lot('B', 'hathazari', 100),
      lot('C', 'jashore', 100),
    ]);
    expect(codes(byCity.dhaka)).toEqual(['A', 'C']);
    expect(codes(byCity.chattogram)).toEqual(['B']);
    expect(skipped).toEqual([]);
  });

  it('needs 24 hours of shelf life left after the truck trip, exactly or more', () => {
    const { byCity, skipped } = assign([lot('OK', 'jashore', 29), lot('LATE', 'jashore', 28.9)]);
    expect(codes(byCity.dhaka)).toEqual(['OK']);
    expect(skipped).toEqual([{ lotCode: 'LATE', reason: 'no_reachable_city' }]);
  });

  it('picks the nearest city that is still fresh, not just the nearest city', () => {
    const farHub = {
      code: 'far',
      kind: 'collection',
      serves: [
        { cityCode: 'dhaka', truckHours: 20 },
        { cityCode: 'chattogram', truckHours: 10 },
      ],
    };
    const { byCity } = assignLotsToCities({
      lots: [lot('A', 'far', 40)],
      hubs: [farHub],
      now: NOW,
    });
    expect(codes(byCity.chattogram)).toEqual(['A']);
    expect(byCity.dhaka).toBeUndefined();
  });

  it('skips lots that are not sellable or have no usable hub', () => {
    const { byCity, skipped } = assign([
      lot('W', 'cumilla', 100, { status: 'withdrawn' }),
      lot('Z', 'cumilla', 100, { remainingKg: 0 }),
      lot('X', 'cumilla', -1),
      lot('N', 'nowhere', 100),
      lot('D', 'dhaka-depot', 100),
    ]);
    expect(skipped).toEqual([
      { lotCode: 'W', reason: 'not_sellable' },
      { lotCode: 'Z', reason: 'not_sellable' },
      { lotCode: 'X', reason: 'not_sellable' },
      { lotCode: 'N', reason: 'unknown_hub' },
      { lotCode: 'D', reason: 'unknown_hub' },
    ]);
    expect(byCity).toEqual({});
  });

  it('skips a lot at an inactive hub', () => {
    const inactive = hubs.map((hub) => (hub.code === 'cumilla' ? { ...hub, active: false } : hub));
    const { skipped } = assignLotsToCities({
      lots: [lot('A', 'cumilla', 100)],
      hubs: inactive,
      now: NOW,
    });
    expect(skipped).toEqual([{ lotCode: 'A', reason: 'unknown_hub' }]);
  });

  it('only considers the cities it is given', () => {
    const { byCity } = assign([lot('A', 'cumilla', 100), lot('B', 'jashore', 40)], {
      cityCodes: ['chattogram', 'sylhet'],
    });
    expect(codes(byCity.chattogram)).toEqual(['A', 'B']);
    expect(byCity.sylhet).toEqual([]);
  });

  it('breaks a tie by city code', () => {
    const tied = {
      code: 'tied',
      kind: 'collection',
      serves: [
        { cityCode: 'dhaka', truckHours: 2 },
        { cityCode: 'chattogram', truckHours: 2 },
      ],
    };
    const { byCity } = assignLotsToCities({
      lots: [lot('A', 'tied', 100)],
      hubs: [tied],
      now: NOW,
    });
    expect(codes(byCity.chattogram)).toEqual(['A']);
  });

  it('places every lot exactly once, or says why it did not', () => {
    const input = [
      lot('A', 'cumilla', 100),
      lot('B', 'jashore', 100),
      lot('C', 'jashore', 10),
      lot('D', 'hathazari', 100, { status: 'expired' }),
    ];
    const { byCity, skipped } = assign(input);
    const placed = Object.values(byCity).flat().length;
    expect(placed + skipped.length).toBe(input.length);
  });
});

describe('splitByTier', () => {
  const stock = (code, produceSlug, remainingKg) => ({ code, produceSlug, remainingKg });
  const slugs = (list) => list.map((l) => l.code);

  it('hands out six equal single-lot produce evenly across the sizes', () => {
    const lots = ['A', 'B', 'C', 'D', 'E', 'F'].map((c) => stock(`L-${c}`, c.toLowerCase(), 100));
    const out = splitByTier(lots);
    expect(slugs(out.family)).toEqual(['L-A', 'L-D']);
    expect(slugs(out.mini)).toEqual(['L-B', 'L-E']);
    expect(slugs(out.bulk)).toEqual(['L-C', 'L-F']);
  });

  it('spreads lots of the same produce across sizes so each can have variety', () => {
    const out = splitByTier([
      stock('L-T1', 'tomato', 100),
      stock('L-T2', 'tomato', 80),
      stock('L-P', 'potato', 60),
    ]);
    expect(slugs(out.family)).toEqual(['L-T1']);
    expect(slugs(out.mini)).toEqual(['L-T2']);
    expect(slugs(out.bulk)).toEqual(['L-P']);
  });

  it('puts every lot in exactly one size', () => {
    const lots = Array.from({ length: 11 }, (_, i) =>
      stock(`L-${String(i).padStart(2, '0')}`, `produce-${i % 4}`, 20 + i * 7),
    );
    const out = splitByTier(lots);
    const all = [...out.mini, ...out.family, ...out.bulk].map((l) => l.code).sort();
    expect(all).toEqual(lots.map((l) => l.code).sort());
  });

  it('gives the same answer whatever order the lots arrive in', () => {
    const lots = Array.from({ length: 9 }, (_, i) => stock(`L-${i}`, `produce-${i % 3}`, 50 + i));
    const forward = splitByTier(lots);
    const backward = splitByTier([...lots].reverse());
    expect(forward).toEqual(backward);
  });
});
