// client/src/pages/admin/Dispatch.jsx
import { useState } from 'react';
import { post } from '../../api/client.js';
import { useApi } from '../../api/useApi.js';
import { useCity } from '../../city/CityContext.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';

export default function Dispatch() {
  const { t, pick } = useI18n();
  const { cities } = useCity();
  const runs = useApi('/admin/runs?limit=10');
  const jobs = useApi('/admin/jobs');
  const [msg, setMsg] = useState('');

  async function dispatch(city) {
    setMsg('');
    try {
      const r = await post('/admin/dispatch', { cityCode: city.code });
      const left = Array.isArray(r.unassigned) ? r.unassigned.length : (r.unassigned ?? 0);
      setMsg(`${city.code}: ${r.runs.length} runs, ${left} unassigned`);
      runs.reload();
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function rebuild() {
    setMsg('');
    try {
      await post('/admin/shelf/rebuild', {});
      setMsg(t('common.saved'));
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {cities.map((c) => (
          <button key={c.code} className="btn-primary" onClick={() => dispatch(c)}>
            {t('admin.dispatchNow')}: {pick(c.nameBn, c.nameEn)}
          </button>
        ))}
        <button className="btn-ghost" onClick={rebuild}>
          {t('admin.rebuild')}
        </button>
      </div>
      {msg && <p role="status">{msg}</p>}

      <div>
        <h2 className="mb-2 font-display text-2xl">{t('admin.runs')}</h2>
        {runs.data?.runs.length === 0 && <p>{t('admin.none')}</p>}
        <ul className="space-y-1">
          {runs.data?.runs.map((r) => (
            <li key={r.code} className="rounded-lg bg-white p-2 text-sm">
              {r.code} · {r.cityCode} · {t(`runstatus.${r.status}`)} · {r.stops.length} stops ·{' '}
              {r.distanceKm} km
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="mb-2 font-display text-2xl">{t('admin.jobs')}</h2>
        {jobs.data && !jobs.data.schedulerRunsHere && <p>{t('admin.noScheduler')}</p>}
        <ul className="space-y-1">
          {jobs.data?.jobs.map((j) => (
            <li key={j.name} className="rounded-lg bg-white p-2 text-sm">
              {j.name} · {j.schedule} · {j.lastStatus ?? '-'}
              {j.lastFinishedAt ? ` · ${new Date(j.lastFinishedAt).toLocaleString()}` : ''}
              {j.lastError ? ` · ${j.lastError}` : ''}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
