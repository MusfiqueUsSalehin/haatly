import { describe, expect, it } from 'vitest';
import { IMPACT_FACTORS } from '../../src/constants/impact.js';
import { orderImpact, sumImpacts } from '../../src/services/impact/calculate.js';

const lots = (...list) => new Map(list.map((lot) => [lot.code, lot]));
const allocation = (lotCode, kg, pricePerKgBdt) => ({
  lotCode,
  produceSlug: 'tomato',
  kg,
  pricePerKgBdt,
});
const orderOf = (...allocations) => ({ items: [{ allocations }] });

describe('orderImpact', () => {
  it('works out kilos, taka saved and CO2e from the lot allocations', () => {
    const order = orderOf(allocation('A', 3, 56), allocation('B', 3, 40));
    const map = lots({ code: 'A', bazarPriceBdt: 70 }, { code: 'B', bazarPriceBdt: 50 });
    expect(orderImpact(order, map)).toEqual({
      kgRescued: 6,
      bazarValueBdt: 360, // 3 x 70 + 3 x 50
      paidBdt: 288, // 3 x 56 + 3 x 40
      savedBdt: 72,
      co2eKg: 2.1, // 6 kg x 0.5 x 0.7
    });
  });

  it('adds up every box in the order', () => {
    const order = {
      items: [{ allocations: [allocation('A', 3, 56)] }, { allocations: [allocation('B', 2, 40)] }],
    };
    const map = lots({ code: 'A', bazarPriceBdt: 70 }, { code: 'B', bazarPriceBdt: 50 });
    expect(orderImpact(order, map)).toEqual({
      kgRescued: 5,
      bazarValueBdt: 310, // 3 x 70 + 2 x 50
      paidBdt: 248, // 3 x 56 + 2 x 40
      savedBdt: 62,
      co2eKg: 1.75, // 5 kg x 0.5 x 0.7
    });
  });

  it('claims no saving for a lot it cannot find', () => {
    const impact = orderImpact(orderOf(allocation('GONE', 2, 30)), lots());
    expect(impact).toMatchObject({ kgRescued: 2, bazarValueBdt: 60, paidBdt: 60, savedBdt: 0 });
    expect(impact.co2eKg).toBe(0.7);
  });

  it('never reports a negative saving', () => {
    const impact = orderImpact(
      orderOf(allocation('A', 1, 56)),
      lots({ code: 'A', bazarPriceBdt: 40 }),
    );
    expect(impact).toMatchObject({ bazarValueBdt: 40, paidBdt: 56, savedBdt: 0 });
  });

  it('rounds away floating point noise in the kilos', () => {
    const order = orderOf(
      allocation('A', 0.1, 56),
      allocation('A', 0.1, 56),
      allocation('A', 0.1, 56),
    );
    expect(orderImpact(order, lots({ code: 'A', bazarPriceBdt: 70 })).kgRescued).toBe(0.3);
  });

  it('counts each rescued kilo as 0.35 kg of CO2e with the current assumptions', () => {
    expect(IMPACT_FACTORS.co2eKgPerKgProduce * IMPACT_FACTORS.wasteShare).toBeCloseTo(0.35);
    expect(Object.isFrozen(IMPACT_FACTORS)).toBe(true);
  });
});

describe('sumImpacts', () => {
  const a = { kgRescued: 6, bazarValueBdt: 360, paidBdt: 288, savedBdt: 72, co2eKg: 2.1 };
  const b = { kgRescued: 0.3, bazarValueBdt: 21, paidBdt: 16.8, savedBdt: 4.2, co2eKg: 0.1 };

  it('adds every figure', () => {
    expect(sumImpacts([a, b])).toEqual({
      kgRescued: 6.3,
      bazarValueBdt: 381,
      paidBdt: 304.8,
      savedBdt: 76.2,
      co2eKg: 2.2,
    });
  });

  it('is all zeros for nothing', () => {
    expect(sumImpacts([])).toEqual({
      kgRescued: 0,
      bazarValueBdt: 0,
      paidBdt: 0,
      savedBdt: 0,
      co2eKg: 0,
    });
  });
});
