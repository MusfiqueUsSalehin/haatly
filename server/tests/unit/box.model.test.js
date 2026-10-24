import { describe, expect, it } from 'vitest';
import { BOX_TIERS, TIERS_BY_SHARE, TIER_NAMES, kgPerItem } from '../../src/constants/boxes.js';
import { Box } from '../../src/models/Box.js';
import { errorsOf } from '../helpers/errorsOf.js';

const line = (produceSlug, overrides) => ({
  produceSlug,
  kgPerBox: 1.5,
  lotCodes: ['LOT-AAAAAAAA'],
  ...overrides,
});
const base = {
  code: 'dhaka-family-2026-10-17',
  cityCode: 'dhaka',
  tier: 'family',
  date: '2026-10-17',
  lines: [line('tomato'), line('potato'), line('spinach')],
  weightKg: 4.5,
  builtPriceBdt: 210,
};

describe('Box', () => {
  it('accepts a valid box', async () => {
    const box = new Box(base);
    expect(await errorsOf(box)).toEqual({});
    expect(box.status).toBe('live');
  });

  it('rejects a code that does not match city, tier and date', async () => {
    expect(await errorsOf(new Box({ ...base, code: 'dhaka-family-2026-10-18' }))).toHaveProperty(
      'code',
    );
  });

  it('rejects fewer than two lines', async () => {
    const one = { ...base, lines: [line('tomato')], weightKg: 1.5 };
    expect(await errorsOf(new Box(one))).toHaveProperty('lines');
  });

  it('rejects more lines than the tier allows', async () => {
    const lines = ['tomato', 'potato', 'okra', 'carrot'].map((slug) => line(slug, { kgPerBox: 1 }));
    const mini = {
      ...base,
      code: 'dhaka-mini-2026-10-17',
      tier: 'mini',
      lines,
      weightKg: 4,
    };
    expect(await errorsOf(new Box(mini))).toHaveProperty('lines');
  });

  it('rejects a line with the wrong weight for the tier', async () => {
    const heavy = { ...base, lines: [line('tomato'), line('potato', { kgPerBox: 2 })] };
    expect(await errorsOf(new Box({ ...heavy, weightKg: 3.5 }))).toHaveProperty('lines');
  });

  it('rejects the same produce twice', async () => {
    const twice = { ...base, lines: [line('tomato'), line('tomato')], weightKg: 3 };
    expect(await errorsOf(new Box(twice))).toHaveProperty('lines');
  });

  it('rejects a weight that does not match the lines', async () => {
    expect(await errorsOf(new Box({ ...base, weightKg: 6 }))).toHaveProperty('weightKg');
  });

  it('rejects an unknown tier and a bad date', async () => {
    expect(await errorsOf(new Box({ ...base, tier: 'giant' }))).toHaveProperty('tier');
    expect(await errorsOf(new Box({ ...base, date: '17-10-2026' }))).toHaveProperty('date');
  });

  it('rejects a line with no lots', async () => {
    const empty = {
      ...base,
      lines: [line('tomato'), line('potato', { lotCodes: [] })],
      weightKg: 3,
    };
    expect(Object.keys(await errorsOf(new Box(empty))).join()).toContain('lotCodes');
  });

  it('has consistent tier settings', () => {
    const shares = TIER_NAMES.reduce((sum, tier) => sum + BOX_TIERS[tier].share, 0);
    expect(shares).toBeCloseTo(1);
    for (const tier of TIER_NAMES) expect((kgPerItem(tier) * 2) % 1).toBe(0);
    expect(TIERS_BY_SHARE).toEqual(['family', 'mini', 'bulk']);
  });

  it('hides mongo internals in JSON', () => {
    const json = new Box(base).toJSON();
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.code).toBe('dhaka-family-2026-10-17');
  });
});
