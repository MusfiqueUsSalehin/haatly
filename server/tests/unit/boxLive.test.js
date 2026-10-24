import { describe, expect, it } from 'vitest';
import {
  availableUnits,
  boxPriceBdt,
  isSellableNow,
  lineStockKg,
  lineUnits,
  weightedPricePerKg,
} from '../../src/services/boxes/live.js';

const NOW = new Date('2026-10-17T06:00:00Z');
const HOUR = 3600 * 1000;
const lot = (code, remainingKg, priceBdt, overrides) => ({
  code,
  remainingKg,
  priceBdt,
  status: 'listed',
  expiresAt: new Date(NOW.getTime() + 50 * HOUR),
  ...overrides,
});
const lots = (...list) => new Map(list.map((l) => [l.code, l]));

// A: 10 kg at 40, B: 30 kg at 62, C is withdrawn, D has expired.
const tomatoLots = () =>
  lots(
    lot('A', 10, 40),
    lot('B', 30, 62),
    lot('C', 9, 50, { status: 'withdrawn' }),
    lot('D', 9, 50, { expiresAt: new Date(NOW.getTime() - HOUR) }),
    lot('E', 9, 60),
  );
const tomatoLine = { produceSlug: 'tomato', kgPerBox: 1.5, lotCodes: ['A', 'B', 'C', 'D', 'GONE'] };
const okraLine = { produceSlug: 'okra', kgPerBox: 1.5, lotCodes: ['E'] };

describe('isSellableNow', () => {
  it('is true only when listed, in stock and before expiry', () => {
    expect(isSellableNow(lot('A', 10, 40), NOW)).toBe(true);
    expect(isSellableNow(lot('A', 10, 40, { status: 'withdrawn' }), NOW)).toBe(false);
    expect(isSellableNow(lot('A', 0, 40), NOW)).toBe(false);
    expect(isSellableNow(lot('A', 10, 40, { expiresAt: NOW }), NOW)).toBe(false);
    expect(isSellableNow(lot('A', 10, 40, { expiresAt: new Date(NOW - HOUR) }), NOW)).toBe(false);
  });
});

describe('weightedPricePerKg', () => {
  it('weights prices by the kilos each lot has left', () => {
    expect(weightedPricePerKg([lot('A', 10, 40), lot('B', 30, 62)])).toBe(56.5);
  });

  it('is null when there is no stock', () => {
    expect(weightedPricePerKg([])).toBeNull();
    expect(weightedPricePerKg([lot('A', 0, 40)])).toBeNull();
  });
});

describe('lineStockKg and lineUnits', () => {
  it('counts only sellable lots and ignores lots that no longer exist', () => {
    expect(lineStockKg(tomatoLine, tomatoLots(), NOW)).toBe(40);
    expect(lineUnits(tomatoLine, tomatoLots(), NOW)).toBe(26);
  });

  it('rounds units down and is exact on a whole number', () => {
    const exact = { produceSlug: 'okra', kgPerBox: 1.5, lotCodes: ['E'] };
    expect(lineUnits(exact, tomatoLots(), NOW)).toBe(6);
    expect(lineUnits({ ...exact, kgPerBox: 2 }, tomatoLots(), NOW)).toBe(4);
  });
});

describe('availableUnits', () => {
  it('is limited by the thinnest line', () => {
    expect(availableUnits({ lines: [tomatoLine, okraLine] }, tomatoLots(), NOW)).toBe(6);
  });

  it('drops to zero when a line has no sellable stock', () => {
    const map = tomatoLots();
    map.get('E').status = 'withdrawn';
    expect(availableUnits({ lines: [tomatoLine, okraLine] }, map, NOW)).toBe(0);
  });

  it('is zero for a box with no lines', () => {
    expect(availableUnits({ lines: [] }, tomatoLots(), NOW)).toBe(0);
  });
});

describe('boxPriceBdt', () => {
  const box = { lines: [tomatoLine, okraLine] };

  it('prices the box from the live lots, in whole taka', () => {
    // 1.5 kg at 56.5 + 1.5 kg at 60 = 84.75 + 90 = 174.75
    expect(boxPriceBdt(box, tomatoLots(), NOW)).toBe(175);
  });

  it('follows a lot being marked down', () => {
    const map = tomatoLots();
    map.get('B').priceBdt = 50; // average becomes 47.5, so 71.25 + 90 = 161.25
    expect(boxPriceBdt(box, map, NOW)).toBe(161);
  });

  it('is null when a line has no stock', () => {
    const map = tomatoLots();
    map.get('E').remainingKg = 0;
    expect(boxPriceBdt(box, map, NOW)).toBeNull();
  });
});
