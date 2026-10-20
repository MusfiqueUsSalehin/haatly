import { describe, expect, it } from 'vitest';
import { isPeakMonth, spoilageRisk, timeRisk } from '../../src/services/pricing/risk.js';

const fiveDays = { shelfLifeDays: 5 }; // 120 hours

describe('timeRisk', () => {
  it('is zero for a fresh lot', () => {
    expect(timeRisk({ ...fiveDays, hoursToExpiry: 120 })).toBe(0);
  });

  it('is one half when half the shelf life is used', () => {
    expect(timeRisk({ ...fiveDays, hoursToExpiry: 60 })).toBe(0.5);
  });

  it('is one at expiry and after', () => {
    expect(timeRisk({ ...fiveDays, hoursToExpiry: 0 })).toBe(1);
    expect(timeRisk({ ...fiveDays, hoursToExpiry: -12 })).toBe(1);
  });

  it('is zero when there is more time left than the shelf life', () => {
    expect(timeRisk({ ...fiveDays, hoursToExpiry: 500 })).toBe(0);
  });
});

describe('spoilageRisk', () => {
  const fresh = { ...fiveDays, hoursToExpiry: 120 };

  it('adds risk for lower grades', () => {
    expect(spoilageRisk({ ...fresh, grade: 'A' }).score).toBe(0);
    expect(spoilageRisk({ ...fresh, grade: 'B' }).score).toBeCloseTo(0.1);
    expect(spoilageRisk({ ...fresh, grade: 'C' }).score).toBeCloseTo(0.2);
  });

  it('adds risk in peak season', () => {
    const score = spoilageRisk({ ...fresh, grade: 'A', inPeakSeason: true }).score;
    expect(score).toBeCloseTo(0.1);
  });

  it('never goes above one', () => {
    const out = spoilageRisk({ ...fiveDays, hoursToExpiry: -5, grade: 'C', inPeakSeason: true });
    expect(out.score).toBe(1);
  });

  it('explains itself with its parts', () => {
    const out = spoilageRisk({ ...fiveDays, hoursToExpiry: 60, grade: 'B', inPeakSeason: true });
    expect(out.parts).toEqual({ time: 0.5, grade: 0.1, season: 0.1 });
  });

  it('rejects invalid input', () => {
    expect(() => spoilageRisk({ ...fresh, grade: 'Z' })).toThrow(RangeError);
    expect(() => spoilageRisk({ ...fresh, grade: 'A', hoursToExpiry: Number.NaN })).toThrow(
      RangeError,
    );
    expect(() => spoilageRisk({ hoursToExpiry: 10, shelfLifeDays: 0, grade: 'A' })).toThrow(
      RangeError,
    );
  });
});

describe('isPeakMonth', () => {
  const tomato = { peakMonths: [12, 1, 2, 3] };

  it('checks the month in Bangladesh time', () => {
    // 20:00 UTC on 31 January is already 1 February in Bangladesh.
    expect(isPeakMonth({ peakMonths: [2] }, new Date('2026-01-31T20:00:00Z'))).toBe(true);
    expect(isPeakMonth({ peakMonths: [1] }, new Date('2026-01-31T20:00:00Z'))).toBe(false);
  });

  it('is true in season and false out of season', () => {
    expect(isPeakMonth(tomato, new Date('2026-01-15T12:00:00Z'))).toBe(true);
    expect(isPeakMonth(tomato, new Date('2026-07-15T06:00:00Z'))).toBe(false);
  });

  it('is false for produce with no season', () => {
    expect(isPeakMonth({ peakMonths: [] }, new Date('2026-01-15T12:00:00Z'))).toBe(false);
  });
});
