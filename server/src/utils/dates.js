const BANGLADESH_OFFSET_MS = 6 * 60 * 60 * 1000;

/** Today's date in Bangladesh time as YYYY-MM-DD (the shelf changes at Bangladesh midnight). */
export function bangladeshDate(now = new Date()) {
  return new Date(now.getTime() + BANGLADESH_OFFSET_MS).toISOString().slice(0, 10);
}
