import { describe, expect, it } from 'vitest';
import { bangladeshDate } from '../../src/utils/dates.js';

describe('bangladeshDate', () => {
  it('uses Bangladesh time, six hours ahead of UTC', () => {
    expect(bangladeshDate(new Date('2026-10-17T17:59:59Z'))).toBe('2026-10-17');
    expect(bangladeshDate(new Date('2026-10-17T18:00:00Z'))).toBe('2026-10-18');
  });

  it('rolls over month and year ends', () => {
    expect(bangladeshDate(new Date('2026-12-31T19:00:00Z'))).toBe('2027-01-01');
  });

  it('defaults to now', () => {
    expect(bangladeshDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
