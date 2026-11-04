// client/src/pages/OrderTrack.jsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { post } from '../api/client.js';
import { useApi } from '../api/useApi.js';
import { useI18n } from '../i18n/I18nContext.jsx';

const LIVE = ['placed', 'out_for_delivery'];

export default function OrderTrack() {
  const { code } = useParams();
  const { t, money } = useI18n();
  const [error, setError] = useState('');
  const [live, setLive] = useState(true);
  // Poll while the order can still change; realtime sockets arrive in step 19.
  const {
    data,
    error: loadError,
    loading,
    reload,
  } = useApi(`/orders/${encodeURIComponent(code)}`, {
    interval: live ? 15000 : undefined,
  });

  if (loading) return <p>{t('common.loading')}</p>;
  if (loadError)
    return (
      <p role="alert" className="text-chili">
        {loadError.message}
      </p>
    );
  const o = data.order;
  if (live && !LIVE.includes(o.status)) setLive(false);

  async function cancel() {
    setError('');
    try {
      await post(`/orders/${encodeURIComponent(code)}/cancel`, {});
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <article className="max-w-xl space-y-4">
      <h1 className="font-display text-3xl">{o.code}</h1>
      <p className="text-lg font-semibold">
        {t(`status.${o.status}`)} · {money(o.totalBdt)} · {t(`paystatus.${o.paymentStatus}`)}
      </p>

      {o.deliveryOtp && (
        <div className="rounded-lg border-2 border-turmeric bg-white p-4 text-center">
          <p className="text-sm">{t('order.otpHelp')}</p>
          <p className="mt-1 font-mono text-4xl tracking-widest">{o.deliveryOtp}</p>
        </div>
      )}

      <div>
        <h2 className="mb-2 font-semibold">{t('order.timeline')}</h2>
        <ol className="space-y-1 border-l-2 border-leaf pl-3">
          {o.statusHistory.map((h) => (
            <li key={`${h.status}-${h.at}`}>
              {t(`status.${h.status}`)} ·{' '}
              <time className="text-sm text-soil/60">{new Date(h.at).toLocaleString()}</time>
            </li>
          ))}
        </ol>
      </div>

      {o.status === 'placed' && (
        <button className="btn-ghost text-chili" onClick={cancel}>
          {t('order.cancel')}
        </button>
      )}
      {error && (
        <p role="alert" className="text-chili">
          {error}
        </p>
      )}
    </article>
  );
}
