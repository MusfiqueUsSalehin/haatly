const GRADE_RISK = Object.freeze({ A: 0, B: 0.1, C: 0.2 });
const SEASON_RISK = 0.1;
const BANGLADESH_OFFSET_MS = 6 * 60 * 60 * 1000;

const clamp01 = (n) => Math.min(1, Math.max(0, n));

function assertValid({ hoursToExpiry, shelfLifeDays, grade }) {
  if (!Number.isFinite(hoursToExpiry)) throw new RangeError('hoursToExpiry must be a number');
  if (!Number.isFinite(shelfLifeDays) || shelfLifeDays <= 0) {
    throw new RangeError('shelfLifeDays must be greater than zero');
  }
  if (!Object.hasOwn(GRADE_RISK, grade)) throw new RangeError(`unknown grade "${grade}"`);
}

/** Share of the shelf life already used: 0 when fresh, 1 at or past expiry. */
export function timeRisk({ hoursToExpiry, shelfLifeDays }) {
  return clamp01(1 - hoursToExpiry / (shelfLifeDays * 24));
}

/** Is this month a seasonal glut for the produce? Months are counted in Bangladesh time. */
export function isPeakMonth(produce, date = new Date()) {
  const month = new Date(date.getTime() + BANGLADESH_OFFSET_MS).getUTCMonth() + 1;
  return produce.peakMonths.includes(month);
}

/** Returns { score, parts } so a price can always be explained. */
export function spoilageRisk({ hoursToExpiry, shelfLifeDays, grade, inPeakSeason = false }) {
  assertValid({ hoursToExpiry, shelfLifeDays, grade });
  const parts = {
    time: timeRisk({ hoursToExpiry, shelfLifeDays }),
    grade: GRADE_RISK[grade],
    season: inPeakSeason ? SEASON_RISK : 0,
  };
  return { score: clamp01(parts.time + parts.grade + parts.season), parts };
}
