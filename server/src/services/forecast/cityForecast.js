import { Produce } from '../../models/Produce.js';
import { addDays } from '../../utils/dates.js';
import { HISTORY_DAYS, buildHistory, demandByProduce } from './demand.js';
import { forecastDemand } from './forecast.js';

/**
 * Forecast demand for every active produce in a city. Produce nobody has ordered gets a
 * forecast of zero (with low confidence), so the list is always complete. Busiest first.
 */
export async function buildCityForecast({
  cityCode,
  horizonDays = 7,
  historyDays = HISTORY_DAYS,
  now = new Date(),
}) {
  const [{ histories, endDate }, produce] = await Promise.all([
    demandByProduce({ cityCode, days: historyDays, now }),
    Produce.find({ active: true }).lean(),
  ]);
  const empty = buildHistory({ endDate, days: historyDays, totalsByDate: {} });

  const forecasts = produce
    .map((item) => {
      const result = forecastDemand({
        history: histories.get(item.slug) ?? empty,
        peakMonths: item.peakMonths,
        horizonDays,
      });
      return {
        produceSlug: item.slug,
        nameEn: item.nameEn,
        nameBn: item.nameBn,
        category: item.category,
        totalKg: result.totalKg,
        daily: result.forecast,
        confidence: result.confidence,
        historyDays,
        activeDays: result.basis.activeDays,
      };
    })
    .sort((a, b) => b.totalKg - a.totalKg || a.nameEn.localeCompare(b.nameEn));

  return { cityCode, asOf: addDays(endDate, 1), horizonDays, forecasts };
}
