const BANGLADESH_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's date in Bangladesh time as YYYY-MM-DD (the shelf changes at Bangladesh midnight). */
export function bangladeshDate(now = new Date()) {
  return new Date(now.getTime() + BANGLADESH_OFFSET_MS).toISOString().slice(0, 10);
}

/** The date n days after (or before, if negative) a YYYY-MM-DD date. */
export function addDays(date, n) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Day of the week for a YYYY-MM-DD date: 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The exact moment a Bangladesh calendar day begins (midnight there is 18:00 UTC the day before). */
export function bangladeshDayStart(date) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - BANGLADESH_OFFSET_MS);
}
