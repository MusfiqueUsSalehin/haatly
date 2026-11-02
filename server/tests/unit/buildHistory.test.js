import { describe, expect, it } from 'vitest';
import { buildHistory } from '../../src/services/forecast/demand.js';

describe('buildHistory', () => {
  it('fills every day, with zeros for days nobody ordered', () => {
    const history = buildHistory({
      endDate: '2026-10-19',
      days: 7,
      totalsByDate: { '2026-10-18': 3, '2026-10-19': 3 },
    });
    expect(history.map((day) => day.date)).toEqual([
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
    ]);
    expect(history.map((day) => day.kg)).toEqual([0, 0, 0, 0, 0, 3, 3]);
  });

  it('ignores totals outside the window', () => {
    const history = buildHistory({
      endDate: '2026-10-19',
      days: 3,
      totalsByDate: { '2026-01-01': 99, '2026-10-20': 99, '2026-10-19': 2 },
    });
    expect(history.map((day) => day.kg)).toEqual([0, 0, 2]);
  });

  it('removes floating point noise', () => {
    const history = buildHistory({
      endDate: '2026-10-19',
      days: 1,
      totalsByDate: { '2026-10-19': 0.1 + 0.2 },
    });
    expect(history[0].kg).toBe(0.3);
  });

  it('works across a month end', () => {
    const history = buildHistory({ endDate: '2026-11-02', days: 4, totalsByDate: {} });
    expect(history.map((day) => day.date)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('needs at least one day', () => {
    for (const days of [0, -1, 2.5]) {
      expect(() => buildHistory({ endDate: '2026-10-19', days, totalsByDate: {} })).toThrow(
        RangeError,
      );
    }
  });
});
