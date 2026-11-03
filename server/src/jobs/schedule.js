import { bangladeshDate, bangladeshDayStart } from '../utils/dates.js';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * A schedule is either { everyMinutes: n } (slots every n minutes on the clock, 1 to 1440)
 * or { dailyAt: 'HH:MM' } (one slot a day at that Bangladesh time). Returns it in a
 * normal form, or throws RangeError.
 */
export function parseSchedule(schedule) {
  const keys = schedule && typeof schedule === 'object' ? Object.keys(schedule) : [];
  if (keys.length !== 1) {
    throw new RangeError('a schedule needs exactly one of everyMinutes or dailyAt');
  }

  if (keys[0] === 'everyMinutes') {
    const n = schedule.everyMinutes;
    if (!Number.isInteger(n) || n < 1 || n > 1440) {
      throw new RangeError('everyMinutes must be a whole number from 1 to 1440');
    }
    return { kind: 'interval', everyMinutes: n };
  }

  if (keys[0] === 'dailyAt') {
    const match =
      typeof schedule.dailyAt === 'string' && schedule.dailyAt.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) throw new RangeError('dailyAt must look like "05:30" (24 hour, Bangladesh time)');
    return {
      kind: 'daily',
      hour: Number(match[1]),
      minute: Number(match[2]),
      text: schedule.dailyAt,
    };
  }

  throw new RangeError('a schedule needs exactly one of everyMinutes or dailyAt');
}

/**
 * The most recent slot at or before `now`. A job runs at most once per slot: it is due when
 * its last start is before this moment. After downtime only the latest slot counts, so a
 * job catches up once instead of once per missed slot.
 */
export function latestSlot(schedule, now) {
  const parsed = parseSchedule(schedule);
  const t = now.getTime();

  if (parsed.kind === 'interval') {
    const length = parsed.everyMinutes * MINUTE_MS;
    return new Date(Math.floor(t / length) * length);
  }
  const today = bangladeshDayStart(bangladeshDate(now)).getTime();
  const slot = today + (parsed.hour * 60 + parsed.minute) * MINUTE_MS;
  return new Date(slot > t ? slot - DAY_MS : slot);
}

/** When the next slot begins. */
export function nextSlot(schedule, now) {
  const parsed = parseSchedule(schedule);
  const length = parsed.kind === 'interval' ? parsed.everyMinutes * MINUTE_MS : DAY_MS;
  return new Date(latestSlot(schedule, now).getTime() + length);
}

/** A readable description, for the admin status page. */
export function describeSchedule(schedule) {
  const parsed = parseSchedule(schedule);
  if (parsed.kind === 'daily') return `every day at ${parsed.text} (Bangladesh time)`;
  return parsed.everyMinutes === 1 ? 'every minute' : `every ${parsed.everyMinutes} minutes`;
}
