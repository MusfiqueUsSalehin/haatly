// client/src/pages/Hub.jsx
import { useApi } from '../api/useApi.js';
import StatCard from '../components/StatCard.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';

/** The hub is never chosen here: the server scopes every call to the manager's own hub. */
export default function Hub() {
  const { t, pick, lang } = useI18n();
  const me = useApi('/hub/me');
  const kind = me.data?.hub.kind;
  const lots = useApi(kind === 'collection' ? '/hub/lots?limit=50' : null);
  const runs = useApi(kind === 'depot' ? '/hub/runs?limit=20' : null);

  if (me.error)
    return (
      <p role="alert" className="text-chili">
        {me.error.message}
      </p>
    );
  if (!me.data) return <p>{t('common.loading')}</p>;
  const hub = me.data.hub;
  const num = (n) =>
    Number(n ?? 0).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US', { maximumFractionDigits: 1 });

  const lotList = lots.data?.lots ?? [];
  const listed = lotList.filter((l) => l.status === 'listed');
  const runList = runs.data?.runs ?? [];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-turmeric-deep">{t('hub.title')}</p>
          <h1 className="font-display text-4xl">{pick(hub.nameBn, hub.nameEn)}</h1>
        </div>
        <span className="chip border border-crate/40 bg-crate/10 px-3 py-1.5 text-crate">
          {t(`hub.${hub.kind}`)}
        </span>
      </div>

      {kind === 'collection' && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label={pick('মোট লট', 'Lots here')}
              value={num(lots.data?.total)}
              color="text-soil"
            />
            <StatCard label={pick('বিক্রির জন্য', 'Listed now')} value={num(listed.length)} />
            <StatCard
              label={pick('অপেক্ষমাণ কেজি', 'Kg waiting')}
              value={num(listed.reduce((n, l) => n + l.remainingKg, 0))}
              color="text-turmeric-deep"
            />
          </div>
          <h2 className="font-display text-2xl">{t('hub.lots')}</h2>
          {lotList.length === 0 && <p className="text-soil-muted">{t('lot.empty')}</p>}
          <ul className="space-y-3">
            {lotList.map((l) => (
              <li key={l.code} className="crate-card flex flex-wrap items-center gap-3 p-4 text-sm">
                <span className="font-mono font-semibold">{l.code}</span>
                <span>
                  {l.produceSlug} · {t('triage.grade')} {l.grade}
                </span>
                <span className="font-mono text-soil-muted">
                  {l.remainingKg}/{l.quantityKg} kg
                </span>
                <span className="ml-auto text-soil-muted">
                  {l.status === 'listed' ? `${l.hoursToExpiry}h` : ''}
                </span>
                <span className="chip border border-jute-deep text-soil-muted">
                  {t(`lotstatus.${l.status}`)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {kind === 'depot' && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label={pick('মোট রান', 'Runs')}
              value={num(runs.data?.total)}
              color="text-soil"
            />
            <StatCard
              label={pick('চলছে', 'In progress')}
              value={num(runList.filter((r) => r.status === 'in_progress').length)}
              color="text-turmeric-deep"
            />
            <StatCard
              label={pick('পরিকল্পিত', 'Planned')}
              value={num(runList.filter((r) => r.status === 'planned').length)}
              color="text-crate"
            />
          </div>
          <h2 className="font-display text-2xl">{t('hub.runs')}</h2>
          {runList.length === 0 && <p className="text-soil-muted">{t('admin.none')}</p>}
          <ul className="space-y-3">
            {runList.map((r) => (
              <li key={r.code} className="crate-card flex flex-wrap items-center gap-3 p-4 text-sm">
                <span className="font-mono font-semibold">{r.code}</span>
                <span className="chip border border-jute-deep text-soil-muted">
                  {t(`runstatus.${r.status}`)}
                </span>
                <span className="ml-auto text-soil-muted">
                  {r.stops.length} {pick('স্টপ', 'stops')} · {r.distanceKm} km
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
