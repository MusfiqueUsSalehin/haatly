import { describe, expect, it } from 'vitest';
import { describeBox } from '../../src/services/boxes/describeBox.js';

const NOW = new Date('2026-10-17T06:00:00Z');
const future = new Date(NOW.getTime() + 50 * 3600 * 1000);
const lot = (code, remainingKg, priceBdt, status = 'listed') => ({
  code,
  remainingKg,
  priceBdt,
  status,
  expiresAt: future,
});
const produceBySlug = {
  tomato: { nameEn: 'Tomato', nameBn: 'টমেটো', bazarPriceBdt: 70 },
  spinach: { nameEn: 'Spinach', nameBn: 'পালং শাক', bazarPriceBdt: 40 },
};
const box = {
  code: 'dhaka-family-2026-10-17',
  cityCode: 'dhaka',
  tier: 'family',
  date: '2026-10-17',
  weightKg: 3,
  lines: [
    { produceSlug: 'tomato', kgPerBox: 1.5, lotCodes: ['T'] },
    { produceSlug: 'spinach', kgPerBox: 1.5, lotCodes: ['S'] },
  ],
};
const lots = (...list) => new Map(list.map((l) => [l.code, l]));

describe('describeBox', () => {
  it('works out units, price and savings from the live lots', () => {
    const view = describeBox(box, lots(lot('T', 30, 50), lot('S', 12, 30)), produceBySlug, NOW);
    expect(view).toMatchObject({
      code: 'dhaka-family-2026-10-17',
      tier: 'family',
      unitsAvailable: 8, // spinach is the thinnest line: 12 kg / 1.5 kg
      soldOut: false,
      priceBdt: 120, // 1.5 x 50 + 1.5 x 30
      bazarValueBdt: 165, // 1.5 x 70 + 1.5 x 40
      savingsPct: 27,
    });
  });

  it('names each line in English and Bangla', () => {
    const view = describeBox(box, lots(lot('T', 30, 50), lot('S', 12, 30)), produceBySlug, NOW);
    expect(view.lines).toEqual([
      { produceSlug: 'tomato', nameEn: 'Tomato', nameBn: 'টমেটো', kgPerBox: 1.5 },
      { produceSlug: 'spinach', nameEn: 'Spinach', nameBn: 'পালং শাক', kgPerBox: 1.5 },
    ]);
  });

  it('shows a sold-out box with no price', () => {
    const view = describeBox(
      box,
      lots(lot('T', 30, 50), lot('S', 12, 30, 'withdrawn')),
      produceBySlug,
      NOW,
    );
    expect(view).toMatchObject({
      unitsAvailable: 0,
      soldOut: true,
      priceBdt: null,
      savingsPct: null,
    });
  });

  it('never reports negative savings', () => {
    const cheap = { tomato: { bazarPriceBdt: 10 }, spinach: { bazarPriceBdt: 10 } };
    const view = describeBox(box, lots(lot('T', 30, 50), lot('S', 12, 30)), cheap, NOW);
    expect(view.savingsPct).toBe(0);
  });
});
