// client/src/pages/Rider.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { post } from '../api/client.js';
import { useApi } from '../api/useApi.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCity } from '../city/CityContext.jsx';
import RouteMap from '../components/RouteMap.jsx';
import StatCard from '../components/StatCard.jsx';
import StopCard from '../components/StopCard.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useSocket } from '../realtime/useSocket.js';

const SEND_EVERY_MS = 5000; // the server allows one location per 2 s; we send far less

export default function Rider() {
  const { t, pick } = useI18n();
  const { user } = useAuth();
  const { cities } = useCity();
  const me = useApi('/rider/me');
  const runs = useApi('/rider/runs');
  const [run, setRun] = useState(null);
  const [error, setError] = useState('');
  const [pos, setPos] = useState(null);
  const lastSent = useRef(0);

  // Work on the run that is moving, else the next planned one.
  const open = runs.data?.runs.filter((r) => r.status !== 'completed') ?? [];
  const active = open.find((r) => r.status === 'in_progress') ?? open[0];
  const detail = useApi(active ? `/rider/runs/${active.code}` : null);

  useEffect(() => {
    if (detail.data) setRun(detail.data.run);
  }, [detail.data]);

  // The server is the source of truth: any push makes us reload instead of guessing.
  const socketRef = useSocket({
    'run:assigned': () => {
      runs.reload();
    },
    'run:update': () => {
      runs.reload();
      detail.reload();
    },
  });

  const inProgress = run?.status === 'in_progress';
  useEffect(() => {
    if (!inProgress || !navigator.geolocation) return undefined;
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const here = { lat: coords.latitude, lng: coords.longitude };
        setPos(here);
        if (Date.now() - lastSent.current < SEND_EVERY_MS) return;
        lastSent.current = Date.now();
        socketRef.current?.emit('rider:location', {
          ...here,
          accuracyM: Math.round(coords.accuracy),
        });
      },
      () => {},
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [inProgress, socketRef]);

  const centers = useMemo(
    () => Object.fromEntries(cities.flatMap((c) => c.zones.map((z) => [z.code, z.center]))),
    [cities],
  );

  // Every action replaces the run with what the server answers.
  async function act(path, body) {
    setError('');
    try {
      const res = await post(path, body ?? {});
      setRun(res.run);
      runs.reload();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function toggleDuty(onDuty) {
    await post('/rider/duty', { onDuty }).catch((err) => setError(err.message));
    me.reload();
  }

  if (me.error)
    return (
      <p role="alert" className="text-chili">
        {me.error.message}
      </p>
    );
  const profile = me.data?.profile;
  const base = run ? `/rider/runs/${run.code}` : '';
  const next = run?.stops.find((s) => s.status === 'pending');
  const done = run?.stops.filter((s) => s.status === 'delivered').length ?? 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-turmeric-deep">
            {t('rider.title')}
          </p>
          <h1 className="font-display text-4xl">{user?.name}</h1>
          {profile && (
            <p className="mt-1 text-sm text-soil-muted">
              {[profile.vehicle, profile.zoneCodes?.join(', ')].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {profile && (
          <button
            onClick={() => toggleDuty(!profile.onDuty)}
            aria-pressed={profile.onDuty}
            className={profile.onDuty ? 'btn-primary' : 'btn-ghost'}
          >
            <span
              className={`h-2 w-2 rounded-full ${profile.onDuty ? 'bg-jute-light' : 'bg-soil-muted'}`}
            />
            {t('rider.onDuty')}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-chili">
          {error}
        </p>
      )}
      {!run && !runs.loading && (
        <p className="crate-card p-6 text-soil-muted">{t('rider.noRuns')}</p>
      )}

      {run && (
        <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-4">
            <section className="crate-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-mono text-xl">{run.code}</h2>
                <span className="chip border border-turmeric/50 bg-turmeric/10 text-turmeric-deep">
                  {t(`runstatus.${run.status}`)}
                  {inProgress && pos ? ` · ● ${pick('লোকেশন চালু', 'location on')}` : ''}
                </span>
              </div>
              {run.status === 'planned' && (
                <button
                  className="btn-primary mt-3"
                  onClick={() => act(`${base}/start`).catch(() => {})}
                >
                  {t('run.start')}
                </button>
              )}
              <div className="mt-4">
                <RouteMap stops={run.stops} centers={centers} rider={pos} label="route" />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <StatCard
                  label={pick('কিমি', 'Distance')}
                  value={`${run.distanceKm}`}
                  color="text-leaf-dark"
                />
                <StatCard
                  label={pick('স্টপ', 'Stops')}
                  value={run.stops.length}
                  color="text-crate"
                />
                <StatCard
                  label={pick('সম্পন্ন', 'Done')}
                  value={`${done}/${run.stops.length}`}
                  color="text-turmeric-deep"
                />
              </div>
            </section>

            {next && inProgress && (
              <section className="rounded-crate border-2 border-turmeric/60 bg-surface p-5">
                <p className="text-xs font-semibold tracking-wide text-turmeric-deep">
                  {pick('পরবর্তী স্টপ', 'Next stop')}
                </p>
                <p className="mt-1 font-display text-2xl">
                  #{next.sequence} · {next.orderCode}
                </p>
                <p className="text-soil-muted">{next.address?.line}</p>
                <div className="mt-3 flex gap-2">
                  {next.phone && (
                    <a href={`tel:${next.phone}`} className="btn-warn flex-1">
                      {next.phone}
                    </a>
                  )}
                  <a
                    className="btn-ghost"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(next.address?.line ?? '')}`}
                  >
                    {pick('ম্যাপে খুলুন', 'Open in Maps')}
                  </a>
                </div>
              </section>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-2xl">{pick('স্টপ তালিকা', 'Stops')}</h2>
              <span className="chip border border-jute-deep text-soil-muted">
                {done}/{run.stops.length}
              </span>
            </div>
            <ul className="space-y-3">
              {run.stops.map((s) => (
                <StopCard
                  key={s.orderCode}
                  stop={s}
                  canAct={inProgress}
                  isNext={s.orderCode === next?.orderCode}
                  onDeliver={(orderCode, otp) => act(`${base}/stops/${orderCode}/deliver`, { otp })}
                  onFail={(orderCode, reason) => act(`${base}/stops/${orderCode}/fail`, { reason })}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
