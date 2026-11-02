import { Order } from '../../models/Order.js';
import { addDays, bangladeshDate, bangladeshDayStart } from '../../utils/dates.js';

export const HISTORY_DAYS = 56;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * One entry for each of the `days` days ending at `endDate`, oldest first. A day with no
 * sales is a zero, never left out: skipping quiet days would make demand look higher.
 * Pure.
 */
export function buildHistory({ endDate, days, totalsByDate }) {
  if (!Number.isInteger(days) || days < 1) throw new RangeError('days must be at least 1');
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(endDate, i - days + 1);
    return { date, kg: round2(totalsByDate[date] ?? 0) };
  });
}

/**
 * Kilos ordered per produce per day, for one city, over the last `days` complete days in
 * Bangladesh time. Today is left out (it is not over, so it would understate demand) and
 * cancelled orders do not count. Returns { histories: Map(slug -> history), endDate }.
 * Produce nobody ordered is absent from the map.
 */
export async function demandByProduce({ cityCode, days = HISTORY_DAYS, now = new Date() }) {
  const today = bangladeshDate(now);
  const endDate = addDays(today, -1);
  const startDate = addDays(today, -days);

  const rows = await Order.aggregate([
    {
      $match: {
        cityCode,
        status: { $ne: 'cancelled' },
        createdAt: { $gte: bangladeshDayStart(startDate), $lt: bangladeshDayStart(today) },
      },
    },
    { $unwind: '$items' },
    { $unwind: '$items.allocations' },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+06:00' } },
          slug: '$items.allocations.produceSlug',
        },
        kg: { $sum: '$items.allocations.kg' },
      },
    },
  ]);

  const totals = new Map();
  for (const { _id, kg } of rows) {
    totals.set(_id.slug, { ...totals.get(_id.slug), [_id.date]: kg });
  }
  const histories = new Map(
    [...totals].map(([slug, totalsByDate]) => [
      slug,
      buildHistory({ endDate, days, totalsByDate }),
    ]),
  );
  return { histories, endDate };
}
