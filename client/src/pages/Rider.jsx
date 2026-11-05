// client/src/pages/Rider.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { post } from '../api/client.js';
import { useApi } from '../api/useApi.js';
import { useCity } from '../city/CityContext.jsx';
import RouteMap from '../components/RouteMap.jsx';
import StopCard from '../components/StopCard.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useSocket } from '../realtime/useSocket.js';

const SEND_EVERY_MS = 5000; // the server allows one location per 2 s; we send far less

export default function Rider() {
  const { t } = useI18n();
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

  // While a run is in progress, share the rider's position (the customer map is fed from this).
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
  const base = run ? `/rider/runs/${run.code}` : '';

  return (
    <section className="space-y-4">
      <h1 className="font-display text-3xl">{t('rider.title')}</h1>
      {me.data && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={me.data.profile.onDuty}
            onChange={(e) => toggleDuty(e.target.checked)}
          />
          {t('rider.onDuty')}
        </label>
      )}
      {error && (
        <p role="alert" className="text-chili">
          {error}
        </p>
      )}
      {!run && !runs.loading && <p>{t('rider.noRuns')}</p>}

      {run && (
        <>
          <p className="font-semibold">
            {t('run.code')} {run.code} · {t(`runstatus.${run.status}`)} · {run.distanceKm} km
          </p>
          {run.status === 'planned' && (
            <button className="btn-primary" onClick={() => act(`${base}/start`).catch(() => {})}>
              {t('run.start')}
            </button>
          )}
          <RouteMap stops={run.stops} centers={centers} rider={pos} label="route" />
          <ul className="space-y-2">
            {run.stops.map((s) => (
              <StopCard
                key={s.orderCode}
                stop={s}
                canAct={run.status === 'in_progress'}
                onDeliver={(orderCode, otp) => act(`${base}/stops/${orderCode}/deliver`, { otp })}
                onFail={(orderCode, reason) => act(`${base}/stops/${orderCode}/fail`, { reason })}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
