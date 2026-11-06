// client/src/pages/admin/Dispatch.jsx  (replace: runs and jobs; the dispatch buttons now live on Overview)
import { useMemo } from 'react';
import { useApi } from '../../api/useApi.js';
import { useCity } from '../../city/CityContext.jsx';
import RouteMap from '../../components/RouteMap.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';

const RUN_TONE = {
  planned: 'border-crate/40 bg-crate/10 text-crate',
  in_progress: 'border-turmeric/50 bg-turmeric/10 text-turmeric-deep',
  completed: 'border-leaf/40 bg-leaf/10 text-leaf-dark',
};

export default function Dispatch() {
  const { t, pick } = useI18n();
  const { cities } = useCity();
  const runs = useApi('/admin/runs?limit=12');
  const jobs = useApi('/admin/jobs');
  const centers = useMemo(
    () => Object.fromEntries(cities.flatMap((c) => c.zones.map((z) => [z.code, z.center]))),
    [cities],
  );

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 font-display text-2xl">{t('admin.runs')}</h2>
        {runs.data?.runs.length === 0 && <p className="text-soil-muted">{t('admin.none')}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {runs.data?.runs.map((r) => (
            <article key={r.code} className="crate-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-mono font-semibold">{r.code}</h3>
                <span className={`chip border ${RUN_TONE[r.status] ?? 'border-jute-deep'}`}>
                  {t(`runstatus.${r.status}`)}
                </span>
              </div>
              <p className="mb-3 text-sm text-soil-muted">
                {r.cityCode} · {r.stops.length} {pick('স্টপ', 'stops')} · {r.distanceKm} km
              </p>
              <RouteMap stops={r.stops} centers={centers} label={r.code} />
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-2xl">{t('admin.jobs')}</h2>
        {jobs.data && !jobs.data.schedulerRunsHere && (
          <p className="mb-2 text-turmeric-deep">{t('admin.noScheduler')}</p>
        )}
        <div className="crate-card overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-left text-xs text-soil-muted">
              <tr>
                <th className="px-4 py-2">Job</th>
                <th className="px-4 py-2">Schedule</th>
                <th className="px-4 py-2">Last run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-jute-deep">
              {jobs.data?.jobs.map((j) => (
                <tr key={j.name}>
                  <td className="px-4 py-2 font-mono">{j.name}</td>
                  <td className="px-4 py-2 text-soil-muted">{j.schedule}</td>
                  <td className="px-4 py-2">
                    <span className={j.lastStatus === 'failed' ? 'text-chili' : 'text-soil-muted'}>
                      {j.lastStatus ?? '-'}
                      {j.lastFinishedAt ? ` · ${new Date(j.lastFinishedAt).toLocaleString()}` : ''}
                    </span>
                    {j.lastError && <p className="text-xs text-chili">{j.lastError}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
