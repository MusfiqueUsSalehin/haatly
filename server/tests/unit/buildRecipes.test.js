import { describe, expect, it } from 'vitest';
import { Box } from '../../src/models/Box.js';
import { buildCityBoxes } from '../../src/services/boxes/buildRecipes.js';
import { errorsOf } from '../helpers/errorsOf.js';

const NOW = new Date('2026-10-17T06:00:00Z');
const HOUR = 3600 * 1000;
const DATE = '2026-10-17';

const produceBySlug = {
  tomato: { category: 'vegetable' },
  potato: { category: 'vegetable' },
  cabbage: { category: 'vegetable' },
  okra: { category: 'vegetable' },
  spinach: { category: 'leafy' },
};
const lot = (code, produceSlug, remainingKg, priceBdt, hoursLeft) => ({
  code,
  produceSlug,
  remainingKg,
  priceBdt,
  status: 'listed',
  expiresAt: new Date(NOW.getTime() + hoursLeft * HOUR),
});
const build = (tier, lots) =>
  buildCityBoxes({
    cityCode: 'dhaka',
    date: DATE,
    lotsByTier: { [tier]: lots },
    produceBySlug,
    now: NOW,
  });
const slugsOf = (box) => box.lines.map((line) => line.produceSlug);

describe('buildCityBoxes', () => {
  it('builds a box from the most urgent produce, mixing categories first', () => {
    const { boxes, skipped } = build('family', [
      lot('L1', 'tomato', 30, 50, 24),
      lot('L2', 'potato', 60, 30, 200),
      lot('L3', 'spinach', 12, 30, 30),
      lot('L4', 'okra', 9, 60, 40),
      lot('L5', 'cabbage', 45, 24, 100),
    ]);
    const box = boxes.find((b) => b.tier === 'family');

    expect(slugsOf(box)).toEqual(['tomato', 'spinach', 'okra', 'cabbage']);
    expect(box).toMatchObject({
      code: 'dhaka-family-2026-10-17',
      cityCode: 'dhaka',
      date: DATE,
      weightKg: 6,
      unitsAtBuild: 6, // okra is the thinnest line: 9 kg / 1.5 kg
      builtPriceBdt: 246, // 1.5 kg x (50 + 30 + 60 + 24)
    });
    expect(box.lines.every((line) => line.kgPerBox === 1.5)).toBe(true);
    expect(skipped.map((s) => s.tier)).toEqual(['mini', 'bulk']);
  });

  it('prefers variety over urgency when there are more produce than slots', () => {
    const { boxes } = build('family', [
      lot('L1', 'tomato', 30, 40, 10),
      lot('L2', 'potato', 30, 40, 20),
      lot('L3', 'cabbage', 30, 40, 30),
      lot('L4', 'okra', 30, 40, 150),
      lot('L5', 'spinach', 30, 40, 200),
    ]);
    // Three vegetables are more urgent, but the leafy green still makes the box.
    expect(slugsOf(boxes[0])).toEqual(['tomato', 'potato', 'spinach', 'cabbage']);
  });

  it('skips a tier that has only one kind of produce', () => {
    const { boxes, skipped } = build('family', [lot('L1', 'tomato', 60, 50, 24)]);
    expect(boxes).toEqual([]);
    expect(skipped).toContainEqual({ tier: 'family', reason: 'not_enough_variety' });
  });

  it('leaves out produce that cannot fill two boxes, but keeps an exact fit', () => {
    const thin = build('family', [
      lot('L1', 'tomato', 30, 50, 24),
      lot('L2', 'spinach', 2.9, 30, 30),
    ]);
    expect(thin.boxes).toEqual([]);

    const exact = build('family', [
      lot('L1', 'tomato', 30, 50, 24),
      lot('L2', 'spinach', 3, 30, 30),
    ]);
    expect(exact.boxes[0]).toMatchObject({ weightKg: 3, unitsAtBuild: 2 });
  });

  it('builds a mini box with one kilo per line', () => {
    const { boxes, skipped } = build('mini', [
      lot('L1', 'tomato', 20, 50, 10),
      lot('L2', 'potato', 10, 30, 20),
    ]);
    expect(boxes[0]).toMatchObject({
      code: 'dhaka-mini-2026-10-17',
      weightKg: 2,
      unitsAtBuild: 10,
      builtPriceBdt: 80,
    });
    expect(skipped.map((s) => s.reason)).toEqual(['no_stock', 'no_stock']);
  });

  it("lists a line's lots with the most urgent first", () => {
    const { boxes } = build('family', [
      lot('X', 'tomato', 10, 40, 60),
      lot('Y', 'tomato', 30, 62, 20),
      lot('S', 'spinach', 12, 30, 50),
    ]);
    const tomato = boxes[0].lines.find((line) => line.produceSlug === 'tomato');
    expect(tomato.lotCodes).toEqual(['Y', 'X']);
  });

  it('prices a line from all its lots, weighted by kilos', () => {
    const { boxes } = build('family', [
      lot('X', 'tomato', 10, 40, 60),
      lot('Y', 'tomato', 30, 62, 20),
      lot('S', 'spinach', 12, 30, 50),
    ]);
    // 1.5 x 56.5 + 1.5 x 30 = 129.75
    expect(boxes[0]).toMatchObject({ builtPriceBdt: 130, unitsAtBuild: 8 });
  });

  it('ignores produce that is not in the catalog', () => {
    const { boxes, skipped } = build('family', [
      lot('L1', 'tomato', 30, 50, 24),
      lot('L2', 'dragonfruit', 30, 90, 10),
    ]);
    expect(boxes).toEqual([]);
    expect(skipped).toContainEqual({ tier: 'family', reason: 'not_enough_variety' });
  });

  it('produces boxes the Box model accepts', async () => {
    const { boxes } = build('family', [
      lot('L1', 'tomato', 30, 50, 24),
      lot('L2', 'spinach', 12, 30, 30),
    ]);
    const { unitsAtBuild: _units, ...saved } = boxes[0];
    expect(await errorsOf(new Box(saved))).toEqual({});
  });
});
