import { describe, expect, it } from 'vitest';
import { Produce } from '../../src/models/Produce.js';
import { errorsOf } from '../helpers/errorsOf.js';

const base = {
  slug: 'tomato',
  nameEn: 'Tomato',
  nameBn: 'টমেটো',
  category: 'vegetable',
  bazarPriceBdt: 70,
  shelfLifeDays: 5,
  peakMonths: [3, 12, 1, 2, 2],
};

describe('Produce', () => {
  it('accepts a valid item and normalises peak months', async () => {
    const item = new Produce(base);
    expect(await errorsOf(item)).toEqual({});
    expect([...item.peakMonths]).toEqual([1, 2, 3, 12]);
  });

  it('rejects bad prices, shelf lives, categories and months', async () => {
    expect(await errorsOf(new Produce({ ...base, bazarPriceBdt: 0 }))).toHaveProperty(
      'bazarPriceBdt',
    );
    expect(await errorsOf(new Produce({ ...base, shelfLifeDays: 0 }))).toHaveProperty(
      'shelfLifeDays',
    );
    expect(await errorsOf(new Produce({ ...base, shelfLifeDays: 2.5 }))).toHaveProperty(
      'shelfLifeDays',
    );
    expect(await errorsOf(new Produce({ ...base, category: 'meat' }))).toHaveProperty('category');
    expect(await errorsOf(new Produce({ ...base, peakMonths: [13] }))).toHaveProperty('peakMonths');
  });

  it('defaults to active with no season', () => {
    const item = new Produce({ ...base, peakMonths: undefined });
    expect(item.active).toBe(true);
    expect([...item.peakMonths]).toEqual([]);
  });
});
