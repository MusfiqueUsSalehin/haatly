// client/src/pages/OrderTrack.jsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { post } from '../api/client.js';
import { useApi } from '../api/useApi.js';
import StatusChip from '../components/StatusChip.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useSocket } from '../realtime/useSocket.js';
import { ROUTES } from '../routes.js';

const LIVE = ['placed', 'out_for_delivery'];

export default function OrderTrack() {
  const { code } = useParams();
  const { t, pick, money } = useI18n();
  const [error, setError] = useState('');
  const [live, setLive] = useState(true);
  // Poll while the order can still change; live pushes make it feel instant.
  const {
    data,
    error: loadError,
    loading,
    reload,
  } = useApi(`/orders/${encodeURIComponent(code)}`, {
    interval: live ? 15000 : undefined,
  });
  const socketRef = useSocket({
    connect: () => socketRef.current?.emit('order:subscribe', { orderCode: code }),
    'order:update': () => reload(),
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

  const steps =
    o.status === 'cancelled'
      ? ['placed', 'cancelled']
      : ['placed', 'out_for_delivery', 'delivered'];
  const at = Object.fromEntries(o.statusHistory.map((h) => [h.status, h.at]));
  const current = Math.max(
    0,
    steps.reduce((idx, s, n) => (at[s] ? n : idx), 0),
  );
  const finished = ['delivered', 'cancelled'].includes(o.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav className="text-sm text-soil-muted">
            <Link to={ROUTES.orders} className="hover:text-leaf-dark">
              {t('orders.title')}
            </Link>{' '}
            / <span className="font-mono">{o.code}</span>
          </nav>
          <h1 className="mt-2 font-display text-4xl">{t(`status.${o.status}`)}</h1>
          <p className="mt-1 text-soil-muted">
            {money(o.totalBdt)} · {t(`paystatus.${o.paymentStatus}`)}
          </p>
        </div>
        {o.deliveryOtp && (
          <div className="rounded-crate border-2 border-turmeric/60 bg-surface p-4 text-center">
            <p className="text-xs text-soil-muted">{t('order.otpHelp')}</p>
            <p className="mt-2 flex justify-center gap-1.5">
              {o.deliveryOtp.split('').map((d, n) => (
                <span
                  key={n}
                  className="grid h-11 w-9 place-items-center rounded-md bg-sunken font-mono text-2xl text-turmeric-deep"
                >
                  {d}
                </span>
              ))}
            </p>
          </div>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="crate-card p-5">
          <h2 className="font-display text-2xl">{t('order.timeline')}</h2>
          <ol className="relative mt-5 space-y-6 border-l-2 border-jute-deep pl-6">
            {steps.map((s, n) => {
              const done = n < current || (n === current && finished);
              const dot =
                s === 'cancelled'
                  ? 'bg-chili'
                  : done
                    ? 'bg-leaf'
                    : n === current
                      ? 'bg-turmeric'
                      : 'bg-jute-deep';
              return (
                <li key={s} className="relative">
                  <span
                    className={`absolute -left-[33px] top-1 h-3.5 w-3.5 rounded-full ring-4 ring-surface ${dot}`}
                  />
                  <p className={`font-semibold ${n > current ? 'text-soil-muted' : ''}`}>
                    {t(`status.${s}`)}
                  </p>
                  {at[s] && (
                    <p className="text-sm text-soil-muted">{new Date(at[s]).toLocaleString()}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <section className="crate-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl">{pick('অর্ডারের বিবরণ', 'Order details')}</h2>
            <StatusChip status={o.status} />
          </div>
          <ul className="mt-3 divide-y divide-jute-deep text-sm">
            {o.items?.map((i) => (
              <li key={i.boxCode} className="flex justify-between py-1.5">
                <span className="capitalize">
                  {i.tier} × {i.qty}
                </span>
                <span>{money(i.qty * i.unitPriceBdt)}</span>
              </li>
            ))}
            <li className="flex justify-between py-1.5">
              <span>{t('checkout.fee')}</span>
              <span>{o.deliveryFeeBdt === 0 ? t('checkout.free') : money(o.deliveryFeeBdt)}</span>
            </li>
            <li className="flex justify-between py-1.5 font-semibold">
              <span>{t('cart.total')}</span>
              <span>{money(o.totalBdt)}</span>
            </li>
          </ul>
          <p className="mt-4 text-sm text-soil-muted">
            {o.recipientName} · {o.address?.line}
            {o.address?.landmark ? ` (${o.address.landmark})` : ''}
          </p>
          {o.status === 'placed' && (
            <button className="btn-ghost mt-4 text-chili" onClick={cancel}>
              {t('order.cancel')}
            </button>
          )}
          {error && (
            <p role="alert" className="mt-2 text-chili">
              {error}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
