// client/src/pages/admin/Overview.jsx
import { useState } from 'react';
import { post } from '../../api/client.js';
import { useApi } from '../../api/useApi.js';
import { useCity } from '../../city/CityContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';

export default function Overview({ goTo }) {
  const { t, pick, money, lang } = useI18n();
  const { cities } = useCity();
  const ov = useApi('/admin/overview');
  const [picked, setPicked] = useState('');
  const [msg, setMsg] = useState('');
  const cityCode = picked || cities[0]?.code || '';
  const num = (n) =>
    Number(n ?? 0).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US', { maximumFractionDigits: 1 });

  async function dispatch() {
    setMsg('');
    try {
      const r = await post('/admin/dispatch', { cityCode });
      const left = Array.isArray(r.unassigned) ? r.unassigned.length : (r.unassigned ?? 0);
      setMsg(`${cityCode}: ${r.runs.length} runs, ${left} unassigned`);
      ov.reload();
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

  if (ov.error)
    return (
      <p role="alert" className="text-chili">
        {ov.error.message}
      </p>
    );
  const d = ov.data;
  const maxOrders = Math.max(1, ...(d?.topZones ?? []).map((z) => z.orders));

  return (
    <div className="space-y-6">
      {d && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-crate border border-leaf/50 bg-leaf/10 p-4">
            <p className="text-xs text-soil-muted">{pick('রক্ষা হার', 'Rescue rate')}</p>
            <p className="mt-1 font-display text-4xl text-leaf-dark">
              {d.rescueRatePct == null ? '–' : `${num(d.rescueRatePct)}%`}
            </p>
            <p className="mt-1 text-xs text-soil-muted">
              {pick(
                'এই সপ্তাহে তালিকার কত কেজি বিক্রি হয়েছে',
                'Share of this week’s listed kg that sold',
              )}
            </p>
          </div>
          <StatCard
            label={pick('৭ দিনের অর্ডার', 'Orders, 7 days')}
            value={num(d.last7Days.orders)}
            color="text-soil"
            hint={money(d.last7Days.revenueBdt)}
          />
          <StatCard
            label={pick('ঝুঁকিতে থাকা লট', 'Lots at risk')}
            value={num(d.lotsAtRisk)}
            color={d.lotsAtRisk > 0 ? 'text-chili' : 'text-soil'}
            hint={pick('১২ ঘণ্টার মধ্যে মেয়াদ শেষ', 'expire within 12 hours')}
          />
          <StatCard
            label={pick('রাইডার ডিউটিতে', 'Riders on duty')}
            value={num(d.ridersOnDuty)}
            color="text-crate"
            hint={`${num(d.runsInProgress)} ${pick('টি রান চলছে', 'runs in progress')}`}
          />
        </div>
      )}

      <section className="crate-card p-5">
        <h2 className="font-display text-2xl">{pick('ম্যানুয়াল কন্ট্রোল', 'Manual control')}</h2>
        <p className="mt-1 text-sm text-soil-muted">
          {pick(
            'সময়সূচির বাইরে হাতে ডিসপ্যাচ বা তাক নতুন করে সাজান।',
            'Run dispatch or rebuild the shelf outside the schedule.',
          )}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            className="input w-auto"
            aria-label="city"
            value={cityCode}
            onChange={(e) => setPicked(e.target.value)}
          >
            {cities.map((c) => (
              <option key={c.code} value={c.code}>
                {pick(c.nameBn, c.nameEn)}
              </option>
            ))}
          </select>
          <button className="btn-primary" onClick={dispatch}>
            {t('admin.dispatchNow')}
          </button>
          <button className="btn-ghost" onClick={rebuild}>
            {t('admin.rebuild')}
          </button>
        </div>
        {msg && (
          <p role="status" className="mt-3 text-sm">
            {msg}
          </p>
        )}
      </section>

      {d && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section className="crate-card p-5">
            <h2 className="font-display text-2xl">{pick('শীর্ষ এলাকা', 'Top areas')}</h2>
            {d.topZones.length === 0 && (
              <p className="mt-3 text-sm text-soil-muted">{t('admin.none')}</p>
            )}
            <ul className="mt-3 space-y-3">
              {d.topZones.map((z) => (
                <li key={z.zoneCode}>
                  <div className="flex justify-between text-sm">
                    <span className="font-mono">{z.zoneCode}</span>
                    <span>{z.orders}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-jute">
                    <div
                      className="h-1.5 rounded-full bg-crate"
                      style={{ width: `${(z.orders / maxOrders) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section
            className={`rounded-crate border p-5 ${d.lotsAtRisk + d.pendingApprovals > 0 ? 'border-chili/50 bg-chili/10' : 'border-jute-deep bg-surface'}`}
          >
            <h2 className="font-display text-2xl">{pick('নজর দিন', 'Keep an eye on')}</h2>
            {d.lotsAtRisk + d.pendingApprovals === 0 && (
              <p className="mt-3 text-sm text-soil-muted">
                {pick('এখন সব ঠিক আছে।', 'All clear right now.')}
              </p>
            )}
            {d.lotsAtRisk > 0 && (
              <p className="mt-3 text-sm">
                {d.lotsAtRisk}{' '}
                {pick('টি লটের মেয়াদ ১২ ঘণ্টার মধ্যে শেষ হবে।', 'lots expire within 12 hours.')}
              </p>
            )}
            {d.pendingApprovals > 0 && (
              <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span>
                  {d.pendingApprovals}{' '}
                  {pick('টি অ্যাকাউন্ট অনুমোদনের অপেক্ষায়।', 'accounts are waiting for approval.')}
                </span>
                <button className="btn-ghost text-sm" onClick={() => goTo('approvals')}>
                  {t('admin.approvals')}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
