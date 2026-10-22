import { describe, expect, it } from 'vitest';
import { planLot } from '../../src/services/lots/planLot.js';
import { AppError } from '../../src/utils/AppError.js';
import { randomCode } from '../../src/utils/ids.js';

const tomato = { slug: 'tomato', bazarPriceBdt: 70, shelfLifeDays: 5, peakMonths: [12, 1, 2, 3] };
const OFF_SEASON = new Date('2026-07-15T06:00:00Z');
const IN_SEASON = new Date('2026-01-15T12:00:00Z');
const HOUR = 3600 * 1000;
const grading = (overrides) => ({
  grade: 'A',
  sellable: true,
  shelfLifeDays: 5,
  defects: [],
  ...overrides,
});
const plan = (overrides = {}) =>
  planLot({
    produce: tomato,
    triage: grading(),
    triageSource: 'rules',
    quantityKg: 100,
    now: OFF_SEASON,
    ...overrides,
  });

describe('planLot', () => {
  it('turns a fresh grade A crate into a priced lot', () => {
    const { fields, quote } = plan();
    expect(fields).toMatchObject({
      produceSlug: 'tomato',
      grade: 'A',
      quantityKg: 100,
      remainingKg: 100,
      shelfLifeDays: 5,
      bazarPriceBdt: 70,
      farmerFloorBdt: 28,
      priceBdt: 56,
      status: 'listed',
      triageSource: 'rules',
    });
    expect(fields.listedAt).toBe(OFF_SEASON);
    expect(fields.expiresAt.getTime() - OFF_SEASON.getTime()).toBe(120 * HOUR);
    expect(quote.farmerPayoutBdt).toBe(40.32);
  });

  it('expires sooner when grading leaves a shorter shelf life', () => {
    const { fields } = plan({ triage: grading({ grade: 'B', shelfLifeDays: 3 }) });
    expect(fields.expiresAt.getTime() - OFF_SEASON.getTime()).toBe(72 * HOUR);
    expect(fields.priceBdt).toBe(56);
  });

  it('prices a risky lot lower from the start', () => {
    const { fields } = plan({
      triage: grading({ grade: 'C', shelfLifeDays: 1 }),
      now: IN_SEASON,
    });
    expect(fields.priceBdt).toBe(50);
  });

  it('never lets the shelf life exceed the catalog value', () => {
    const { fields } = plan({ triage: grading({ shelfLifeDays: 99 }) });
    expect(fields.shelfLifeDays).toBe(5);
    expect(fields.expiresAt.getTime() - OFF_SEASON.getTime()).toBe(120 * HOUR);
  });

  it('refuses a crate that cannot be sold', () => {
    const unsafe = grading({ sellable: false, shelfLifeDays: 0, defects: ['rot'] });
    let error;
    try {
      plan({ triage: unsafe });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 422, code: 'not_sellable' });
    expect(error.details).toEqual({ defects: ['rot'] });
  });
});

describe('randomCode', () => {
  it('has the expected shape and avoids look-alike characters', () => {
    for (let i = 0; i < 200; i++) {
      expect(randomCode('LOT')).toMatch(/^LOT-[A-HJ-NP-Z2-9]{8}$/);
    }
  });

  it('does not repeat', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => randomCode('LOT')));
    expect(codes.size).toBe(2000);
  });
});
