import { addDays, weekdayOf } from '../../utils/dates.js';

export const SEASON_BOOST = 1.15; // demand in a peak month, relative to a normal month
export const ALPHA = 0.3; // how fast the level follows recent days
export const MIN_ACTIVE_DAYS = 10; // days with sales needed before trusting a trend
export const MIN_DAYS_FOR_WEEKDAYS = 21; // three full weeks before trusting a weekday pattern

const FLAT = Object.freeze([1, 1, 1, 1, 1, 1, 1]);
const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;
const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

function check(history, horizonDays) {
  if (!Array.isArray(history) || history.length === 0) {
    throw new RangeError('history must be a non-empty list of days');
  }
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 30) {
    throw new RangeError('horizonDays must be a whole number from 1 to 30');
  }
  history.forEach(({ date, kg }, i) => {
    if (!Number.isFinite(kg) || kg < 0) throw new RangeError(`day ${date}: kg must be 0 or more`);
    if (i > 0 && date !== addDays(history[i - 1].date, 1)) {
      throw new RangeError(`day ${date}: history must have one entry for every day, in order`);
    }
  });
}

/**
 * How much busier or quieter each day of the week is than average (index 0 = Sunday), as
 * factors averaging 1. Each factor is pulled towards 1 by how few weeks it is based on, so
 * a few odd days cannot create an extreme pattern.
 */
export function weekdayFactors(history) {
  const counts = new Array(7).fill(0);
  const sums = new Array(7).fill(0);
  for (const { date, kg } of history) {
    counts[weekdayOf(date)] += 1;
    sums[weekdayOf(date)] += kg;
  }
  const overall = mean(history.map((day) => day.kg));
  if (overall <= 0) return [...FLAT];

  const shrunk = sums.map((sum, day) => {
    if (counts[day] === 0) return 1;
    const raw = sum / counts[day] / overall;
    const weight = counts[day] / (counts[day] + 2);
    return 1 + (raw - 1) * weight;
  });
  const average = mean(shrunk);
  return shrunk.map((factor) => factor / average);
}

function ewma(values) {
  return values.reduce((level, value) => ALPHA * value + (1 - ALPHA) * level);
}

function confidenceFor(days, activeDays) {
  if (days < 14 || activeDays < MIN_ACTIVE_DAYS) return 'low';
  if (days >= 56 && activeDays >= 30) return 'high';
  return 'medium';
}

/**
 * Forecast daily demand (kg) for the days after `history`.
 *   history      [{ date: 'YYYY-MM-DD', kg }], one entry per day, oldest first
 *   peakMonths   months (1-12) when this produce is in season
 *
 * level (recent demand, weekday effect removed) x weekday factor x season ratio.
 * The season ratio compares the forecast day's month with the month the history ended in,
 * because recent sales already reflect that month's season.
 */
export function forecastDemand({ history, peakMonths = [], horizonDays = 7 }) {
  check(history, horizonDays);

  const days = history.length;
  const activeDays = history.filter((day) => day.kg > 0).length;
  const factors =
    days >= MIN_DAYS_FOR_WEEKDAYS && activeDays >= MIN_ACTIVE_DAYS
      ? weekdayFactors(history)
      : [...FLAT];

  const adjusted = history.map(({ date, kg }) => kg / factors[weekdayOf(date)]);
  // With few selling days, the last day's value would swamp an EWMA, so use the average.
  const level = activeDays >= MIN_ACTIVE_DAYS ? ewma(adjusted) : mean(adjusted);

  const seasonOf = (date) => (peakMonths.includes(Number(date.slice(5, 7))) ? SEASON_BOOST : 1);
  const lastDate = history.at(-1).date;
  const base = seasonOf(lastDate);

  const forecast = Array.from({ length: horizonDays }, (_, i) => {
    const date = addDays(lastDate, i + 1);
    const kg = level * factors[weekdayOf(date)] * (seasonOf(date) / base);
    return { date, kg: round2(Math.max(0, kg)) };
  });

  return {
    forecast,
    totalKg: round2(forecast.reduce((sum, day) => sum + day.kg, 0)),
    level: round2(level),
    weekdayFactors: factors.map(round3),
    confidence: confidenceFor(days, activeDays),
    basis: { days, activeDays },
  };
}
