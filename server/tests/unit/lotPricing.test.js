import { describe, expect, it } from 'vitest';
import { PRICING_POLICY, round2 } from '../../src/services/pricing/policy.js';
import { priceLot } from '../../src/services/pricing/pricing.js';

const tomato = { bazarPriceBdt: 70, peakMonths: [12, 1, 2, 3] };
const OFF_SEASON = new Date('2026-07-15T06:00:00Z');
const IN_SEASON = new Date('2026-01-15T12:00:00Z');
// A tomato lot with a 5 day (120 hour) shelf life.
const lot = (overrides) => ({
  produce: tomato,
  shelfLifeDays: 5,
  grade: 'A',
  now: OFF_SEASON,
  hoursToExpiry: 120,
  ...overrides,
});

describe('priceLot', () => {
  it('gives a fresh grade A lot the smallest discount', () => {
    expect(priceLot(lot())).toMatchObject({
      priceBdt: 56,
      discountPct: 20,
      farmerPayoutBdt: 40.32,
      riskScore: 0,
      atFloor: false,
    });
  });

  it('marks the price down as the lot ages', () => {
    expect(priceLot(lot({ hoursToExpiry: 66 }))).toMatchObject({
      priceBdt: 50,
      farmerPayoutBdt: 36,
    });
  });

  it('drops to the floor when expiry is close, and the farmer still gets their floor', () => {
    expect(priceLot(lot({ hoursToExpiry: 24 }))).toMatchObject({
      priceBdt: 39,
      discountPct: 44,
      farmerFloorBdt: 28,
      consumerFloorBdt: 39,
      farmerPayoutBdt: 28.08,
      atFloor: true,
    });
  });

  it('marks lower grades down faster', () => {
    const out = priceLot(lot({ grade: 'B', hoursToExpiry: 66 }));
    expect(out).toMatchObject({ priceBdt: 45, riskScore: 0.55 });
  });

  it('marks produce down sooner in peak season', () => {
    expect(priceLot(lot({ hoursToExpiry: 96 })).priceBdt).toBe(56);
    expect(priceLot(lot({ hoursToExpiry: 96, now: IN_SEASON })).priceBdt).toBe(50);
  });

  it('never raises a price that is already lower', () => {
    expect(priceLot(lot({ currentPriceBdt: 50 })).priceBdt).toBe(50);
  });

  it('lets the floor beat a current price that is too low', () => {
    expect(priceLot(lot({ currentPriceBdt: 30 })).priceBdt).toBe(39);
  });

  it('prices an expired lot at the floor instead of failing', () => {
    expect(priceLot(lot({ hoursToExpiry: -5 }))).toMatchObject({ priceBdt: 39, riskScore: 1 });
  });

  it('rejects invalid input', () => {
    expect(() => priceLot(lot({ grade: 'Z' }))).toThrow(RangeError);
    expect(() => priceLot(lot({ hoursToExpiry: Number.NaN }))).toThrow(RangeError);
  });
});

describe('priceLot guarantees', () => {
  const bazarPrices = [10, 33, 70, 140, 400];
  const hours = Array.from({ length: 29 }, (_, i) => 140 - i * 5); // 140 down to 0

  it('never breaks the floor, never exceeds bazar, always whole taka', () => {
    for (const bazarPriceBdt of bazarPrices) {
      for (const grade of ['A', 'B', 'C']) {
        for (const now of [OFF_SEASON, IN_SEASON]) {
          for (const hoursToExpiry of hours) {
            const produce = { bazarPriceBdt, peakMonths: [12, 1, 2, 3] };
            const out = priceLot({ produce, shelfLifeDays: 5, grade, now, hoursToExpiry });

            expect(Number.isInteger(out.priceBdt)).toBe(true);
            expect(out.priceBdt).toBeLessThanOrEqual(bazarPriceBdt);
            expect(out.priceBdt).toBeGreaterThanOrEqual(out.consumerFloorBdt);
            // The farmer's share alone covers the floor: no top-up was ever needed.
            const share = round2(out.priceBdt * PRICING_POLICY.farmerShare);
            expect(share).toBeGreaterThanOrEqual(out.farmerFloorBdt);
            expect(out.farmerPayoutBdt).toBeGreaterThanOrEqual(out.farmerFloorBdt);
            expect(out.discountPct).toBeLessThanOrEqual(44);
          }
        }
      }
    }
  });

  it('only ever marks a lot down as time passes', () => {
    for (const bazarPriceBdt of bazarPrices) {
      for (const grade of ['A', 'B', 'C']) {
        let previous = Infinity;
        for (const hoursToExpiry of hours) {
          const produce = { bazarPriceBdt, peakMonths: [] };
          const { priceBdt } = priceLot({ produce, shelfLifeDays: 5, grade, hoursToExpiry });
          expect(priceBdt).toBeLessThanOrEqual(previous);
          previous = priceBdt;
        }
      }
    }
  });
});
