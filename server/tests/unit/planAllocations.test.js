import { describe, expect, it } from 'vitest';
import { planAllocations } from '../../src/services/orders/planAllocations.js';
import { AppError } from '../../src/utils/AppError.js';

const NOW = new Date('2026-10-17T06:00:00Z');
const HOUR = 3600 * 1000;
const lot = (code, remainingKg, priceBdt, overrides) => ({
  code,
  remainingKg,
  priceBdt,
  status: 'listed',
  expiresAt: new Date(NOW.getTime() + 40 * HOUR),
  ...overrides,
});
const lotMap = (...lots) => new Map(lots.map((l) => [l.code, l]));

// Tomato comes from A (urgent, 10 kg at 40) then B (30 kg at 62). Spinach comes from S.
const box = {
  code: 'dhaka-family-2026-10-17',
  lines: [
    { produceSlug: 'tomato', kgPerBox: 1.5, lotCodes: ['A', 'B'] },
    { produceSlug: 'spinach', kgPerBox: 1.5, lotCodes: ['S'] },
  ],
};
const lots = () => lotMap(lot('A', 10, 40), lot('B', 30, 62), lot('S', 12, 30));
const plan = (qty, map = lots()) => planAllocations({ box, qty, lotMap: map, now: NOW });
const failure = (fn) => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return null;
};

describe('planAllocations', () => {
  it('takes what a small order needs from the most urgent lot', () => {
    expect(plan(2).allocations).toEqual([
      { lotCode: 'A', produceSlug: 'tomato', kg: 3, pricePerKgBdt: 40 },
      { lotCode: 'S', produceSlug: 'spinach', kg: 3, pricePerKgBdt: 30 },
    ]);
  });

  it('spills into the next lot once the urgent one runs out', () => {
    expect(plan(8).allocations).toEqual([
      { lotCode: 'A', produceSlug: 'tomato', kg: 10, pricePerKgBdt: 40 },
      { lotCode: 'B', produceSlug: 'tomato', kg: 2, pricePerKgBdt: 62 },
      { lotCode: 'S', produceSlug: 'spinach', kg: 12, pricePerKgBdt: 30 },
    ]);
  });

  it('refuses an order the stock cannot fill, and says which produce is short', () => {
    const err = failure(() => plan(9));
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 409, code: 'insufficient_stock' });
    expect(err.details).toEqual({
      boxCode: 'dhaka-family-2026-10-17',
      produceSlug: 'spinach',
      missingKg: 1.5,
    });
  });

  it('skips lots that are withdrawn, expired or empty', () => {
    const map = lotMap(
      lot('A', 10, 40, { status: 'withdrawn' }),
      lot('B', 30, 62),
      lot('S', 12, 30),
    );
    expect(plan(2, map).allocations[0]).toEqual({
      lotCode: 'B',
      produceSlug: 'tomato',
      kg: 3,
      pricePerKgBdt: 62,
    });

    const gone = lotMap(lot('A', 10, 40, { expiresAt: NOW }), lot('B', 0, 62), lot('S', 12, 30));
    expect(failure(() => plan(1, gone)).details.produceSlug).toBe('tomato');
  });

  it('treats a lot that no longer exists as having no stock', () => {
    const err = failure(() => plan(2, lotMap(lot('S', 12, 30))));
    expect(err.details).toEqual({
      boxCode: 'dhaka-family-2026-10-17',
      produceSlug: 'tomato',
      missingKg: 3,
    });
  });

  it('reports the price one box costs from the live lots', () => {
    expect(plan(2).unitPriceBdt).toBe(130); // 1.5 x 56.5 + 1.5 x 30 = 129.75
    const cheaper = lotMap(lot('A', 10, 40), lot('B', 30, 50), lot('S', 12, 30));
    expect(plan(2, cheaper).unitPriceBdt).toBe(116); // 1.5 x 47.5 + 45 = 116.25
  });

  it('always covers exactly the kilos the boxes need', () => {
    for (let qty = 1; qty <= 8; qty++) {
      const { allocations } = plan(qty);
      for (const line of box.lines) {
        const total = allocations
          .filter((a) => a.produceSlug === line.produceSlug)
          .reduce((sum, a) => sum + a.kg, 0);
        expect(total).toBeCloseTo(qty * line.kgPerBox, 6);
      }
    }
  });
});
