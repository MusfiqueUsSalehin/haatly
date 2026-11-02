import { describe, expect, it } from 'vitest';
import {
  SEASON_BOOST,
  forecastDemand,
  weekdayFactors,
} from '../../src/services/forecast/forecast.js';
import { addDays, weekdayOf } from '../../src/utils/dates.js';

const series = (start, days, kgOf) =>
  Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i);
    return { date, kg: kgOf(date, i) };
  });
const flat = (start, days, kg) => series(start, days, () => kg);
const kgs = (forecast) => forecast.map((day) => day.kg);

// 2026-09-21 is a Monday, so these 28 days are exactly four weeks ending on Sunday 10-18.
const FOUR_WEEKS = '2026-09-21';
const fridayPeak = (date) => (weekdayOf(date) === 5 ? 20 : 10);

describe('forecastDemand: level', () => {
  it('forecasts a steady history as steady demand', () => {
    const out = forecastDemand({ history: flat(FOUR_WEEKS, 28, 10) });
    expect(kgs(out.forecast)).toEqual([10, 10, 10, 10, 10, 10, 10]);
    expect(out.forecast[0].date).toBe('2026-10-19');
    expect(out.forecast[6].date).toBe('2026-10-25');
    expect(out).toMatchObject({
      totalKg: 70,
      level: 10,
      confidence: 'medium',
      basis: { days: 28, activeDays: 28 },
    });
    expect(out.weekdayFactors).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('follows a recent change, but not all the way', () => {
    const history = series('2026-10-10', 10, (_d, i) => (i === 9 ? 20 : 10));
    const out = forecastDemand({ history });
    expect(kgs(out.forecast)).toEqual([13, 13, 13, 13, 13, 13, 13]); // 0.7 x 10 + 0.3 x 20
    expect(out.confidence).toBe('low'); // only ten days of history
  });

  it('uses the average when there are few selling days, instead of the last day', () => {
    const history = series('2026-10-10', 10, (_d, i) => (i === 9 ? 9 : 0));
    const out = forecastDemand({ history });
    expect(kgs(out.forecast)).toEqual([0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(out.totalKg).toBe(6.3);
    expect(out.weekdayFactors).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(out.confidence).toBe('low');
  });

  it('forecasts zero, not NaN, when nothing has ever sold', () => {
    const out = forecastDemand({ history: flat('2026-08-24', 56, 0) });
    expect(kgs(out.forecast)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(out).toMatchObject({ totalKg: 0, level: 0, confidence: 'low' });
    expect(out.weekdayFactors).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('is confident only with long, busy history', () => {
    expect(forecastDemand({ history: flat('2026-08-24', 56, 10) }).confidence).toBe('high');
    expect(forecastDemand({ history: flat(FOUR_WEEKS, 28, 10) }).confidence).toBe('medium');
    expect(forecastDemand({ history: flat('2026-10-10', 10, 10) }).confidence).toBe('low');
  });

  it('rounds to two decimals and supports a horizon of up to 30 days', () => {
    const out = forecastDemand({
      history: series('2026-08-24', 56, (_d, i) => (i === 55 ? 6 : 0)),
      horizonDays: 14,
    });
    expect(out.forecast).toHaveLength(14);
    expect(out.forecast[0].kg).toBe(0.11); // 6 kg over 56 days
  });
});

describe('forecastDemand: weekday pattern', () => {
  it('learns that Fridays are busier, pulled part-way towards "no pattern"', () => {
    const history = series(FOUR_WEEKS, 28, fridayPeak);
    const out = forecastDemand({ history });

    expect(out.weekdayFactors[5]).toBeCloseTo(1.5, 3);
    for (const day of [0, 1, 2, 3, 4, 6]) expect(out.weekdayFactors[day]).toBeCloseTo(0.917, 3);
    expect(out.weekdayFactors.reduce((sum, f) => sum + f, 0) / 7).toBeCloseTo(1, 2);

    const friday = out.forecast.find((day) => day.date === '2026-10-23');
    const monday = out.forecast.find((day) => day.date === '2026-10-19');
    expect(friday.kg).toBeGreaterThan(monday.kg * 1.5);
    expect(out.totalKg).toBeCloseTo(7 * out.level, 0);
  });

  it('ignores the weekday pattern when there is less than three weeks of data', () => {
    const out = forecastDemand({ history: series('2026-10-05', 14, fridayPeak) });
    expect(out.weekdayFactors).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
});

describe('weekdayFactors', () => {
  it('stays centred on 1 even when weekdays have different numbers of days', () => {
    const history = series('2026-09-21', 23, (date) => (weekdayOf(date) === 5 ? 30 : 10));
    const factors = weekdayFactors(history);
    expect(factors.reduce((sum, f) => sum + f, 0) / 7).toBeCloseTo(1, 9);
    expect(factors[5]).toBe(Math.max(...factors));
  });

  it('is flat for a flat history and for a history of zeros', () => {
    for (const kg of [0, 10]) {
      const factors = weekdayFactors(flat(FOUR_WEEKS, 28, kg));
      for (const factor of factors) expect(factor).toBeCloseTo(1, 9);
    }
  });
});

describe('forecastDemand: season', () => {
  const peak = [12, 1, 2, 3];
  const run = (start, peakMonths = peak) => {
    const history = flat(addDays(start, -27), 28, 10);
    return forecastDemand({ history, peakMonths }).forecast;
  };

  it('raises demand as the forecast moves into the season', () => {
    const forecast = run('2026-11-29'); // history ends in November, the season starts in December
    expect(forecast[0]).toEqual({ date: '2026-11-30', kg: 10 });
    expect(kgs(forecast.slice(1))).toEqual([11.5, 11.5, 11.5, 11.5, 11.5, 11.5]);
    expect(SEASON_BOOST).toBe(1.15);
  });

  it('lowers demand as the forecast moves out of the season', () => {
    const forecast = run('2027-03-30'); // history ends in March (peak), April is not
    expect(forecast[0]).toEqual({ date: '2027-03-31', kg: 10 });
    expect(kgs(forecast.slice(1))).toEqual([8.7, 8.7, 8.7, 8.7, 8.7, 8.7]);
  });

  it('does not count the season twice when it is already reflected in the history', () => {
    expect(kgs(run('2026-12-10'))).toEqual([10, 10, 10, 10, 10, 10, 10]);
  });

  it('changes nothing for produce with no season', () => {
    expect(kgs(run('2026-11-29', []))).toEqual([10, 10, 10, 10, 10, 10, 10]);
  });
});

describe('forecastDemand: checks', () => {
  const ok = flat(FOUR_WEEKS, 28, 10);

  it('refuses an empty history, a negative or invalid amount, and a gap in the days', () => {
    expect(() => forecastDemand({ history: [] })).toThrow(RangeError);
    expect(() => forecastDemand({ history: [{ date: '2026-10-01', kg: -1 }] })).toThrow(RangeError);
    expect(() => forecastDemand({ history: [{ date: '2026-10-01', kg: Number.NaN }] })).toThrow(
      RangeError,
    );
    const gap = [...ok.slice(0, 5), ...ok.slice(6)];
    expect(() => forecastDemand({ history: gap })).toThrow(/every day/);
    const wrongOrder = [...ok].reverse();
    expect(() => forecastDemand({ history: wrongOrder })).toThrow(RangeError);
  });

  it('refuses a horizon outside 1-30 days', () => {
    for (const horizonDays of [0, 31, 2.5, '7']) {
      expect(() => forecastDemand({ history: ok, horizonDays })).toThrow(/horizonDays/);
    }
  });

  it('does not change the history it is given', () => {
    const before = JSON.stringify(ok);
    forecastDemand({ history: ok });
    expect(JSON.stringify(ok)).toBe(before);
  });
});
