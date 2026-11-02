import { describe, expect, it } from 'vitest';
import { addDays, bangladeshDayStart, weekdayOf } from '../../src/utils/dates.js';

describe('addDays', () => {
  it('moves forward and back across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-20', 0)).toBe('2026-10-20');
  });

  it('knows about leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('rejects a date that does not exist', () => {
    expect(() => addDays('not-a-date', 1)).toThrow();
  });
});

describe('weekdayOf', () => {
  it('numbers days from Sunday (0) to Saturday (6)', () => {
    expect(weekdayOf('2026-11-01')).toBe(0); // Sunday
    expect(weekdayOf('2026-11-02')).toBe(1); // Monday
    expect(weekdayOf('2026-10-16')).toBe(5); // Friday
    expect(weekdayOf('2026-10-17')).toBe(6); // Saturday
  });
});

describe('bangladeshDayStart', () => {
  it('starts a Bangladesh day at 18:00 UTC the evening before', () => {
    expect(bangladeshDayStart('2026-10-20').toISOString()).toBe('2026-10-19T18:00:00.000Z');
  });

  it('puts the start of the next day exactly 24 hours later', () => {
    const next = bangladeshDayStart(addDays('2026-10-20', 1));
    expect(next - bangladeshDayStart('2026-10-20')).toBe(24 * 3600 * 1000);
  });
});
