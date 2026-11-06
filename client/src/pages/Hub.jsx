// client/src/pages/Hub.jsx
import { useApi } from '../api/useApi.js';
import { useI18n } from '../i18n/I18nContext.jsx';

/** The hub is never chosen here: the server scopes every call to the manager's own hub. */
export default function Hub() {
  const { t, pick } = useI18n();
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

  return (
    <section className="space-y-4">
      <h1 className="font-display text-3xl">
        {t('hub.title')}: {pick(hub.nameBn, hub.nameEn)}
      </h1>
      <p className="text-soil-muted">{t(`hub.${hub.kind}`)}</p>

      {kind === 'collection' && (
        <>
          <h2 className="font-display text-2xl">{t('hub.lots')}</h2>
          {lots.data?.lots.length === 0 && <p>{t('lot.empty')}</p>}
          <ul className="space-y-2">
            {lots.data?.lots.map((l) => (
              <li key={l.code} className="rounded-lg bg-surface p-3 text-sm">
                <span className="font-semibold">{l.code}</span> · {l.produceSlug} ·{' '}
                {t('triage.grade')} {l.grade} · {l.remainingKg}/{l.quantityKg} kg ·{' '}
                {t(`lotstatus.${l.status}`)} · {l.hoursToExpiry}h
              </li>
            ))}
          </ul>
        </>
      )}

      {kind === 'depot' && (
        <>
          <h2 className="font-display text-2xl">{t('hub.runs')}</h2>
          {runs.data?.runs.length === 0 && <p>{t('admin.none')}</p>}
          <ul className="space-y-2">
            {runs.data?.runs.map((r) => (
              <li key={r.code} className="rounded-lg bg-surface p-3 text-sm">
                {r.code} · {t(`runstatus.${r.status}`)} · {r.stops.length} stops · {r.distanceKm} km
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
