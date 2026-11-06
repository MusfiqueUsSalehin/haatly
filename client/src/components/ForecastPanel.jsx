// client/src/components/ForecastPanel.jsx
import { useState } from 'react';
import { useApi } from '../api/useApi.js';
import { useCity } from '../city/CityContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';

// Confidence may arrive as 0-1 or as a label; show either sensibly.
const conf = (c) => (typeof c === 'number' ? `${Math.round(c <= 1 ? c * 100 : c)}%` : (c ?? '–'));

export default function ForecastPanel() {
  const { pick } = useI18n();
  const { cities, city } = useCity();
  const [picked, setPicked] = useState('');
  const active = picked || city?.code;
  const { data, error, loading } = useApi(active ? `/forecast?city=${active}&days=7` : null);
  const rows = (data?.forecasts ?? []).filter((f) => f.totalKg > 0).slice(0, 6);

  return (
    <section className="crate-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl">{pick('চাহিদা পূর্বাভাস', 'Demand forecast')}</h2>
        <select
          className="input w-auto"
          aria-label="city"
          value={active ?? ''}
          onChange={(e) => setPicked(e.target.value)}
        >
          {cities.map((c) => (
            <option key={c.code} value={c.code}>
              {pick(c.nameBn, c.nameEn)}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1 text-sm text-soil-muted">
        {pick(
          'আগামী ৭ দিনে শহর জুড়ে আনুমানিক চাহিদা: কী তালিকাভুক্ত করবেন তার ইঙ্গিত।',
          'Expected demand across the city over the next 7 days: a hint at what to list.',
        )}
      </p>

      {loading && <p className="mt-4 text-sm">…</p>}
      {error && (
        <p role="alert" className="mt-4 text-sm text-chili">
          {error.message}
        </p>
      )}
      {data && rows.length === 0 && (
        <p className="mt-4 text-sm text-soil-muted">
          {pick(
            'পূর্বাভাসের জন্য এখনো যথেষ্ট অর্ডারের ইতিহাস নেই।',
            'Not enough order history yet for a forecast.',
          )}
        </p>
      )}
      {rows.length > 0 && (
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-xs text-soil-muted">
            <tr>
              <th className="pb-2 font-semibold">{pick('ফসল', 'Produce')}</th>
              <th className="pb-2 font-semibold">{pick('চাহিদা', 'Expected')}</th>
              <th className="pb-2 font-semibold">{pick('নিশ্চয়তা', 'Confidence')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-jute-deep">
            {rows.map((f) => (
              <tr key={f.produceSlug}>
                <td className="py-2 font-semibold">{pick(f.nameBn, f.nameEn)}</td>
                <td className="py-2 font-mono">{Math.round(f.totalKg)} kg</td>
                <td className="py-2 text-soil-muted">{conf(f.confidence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
