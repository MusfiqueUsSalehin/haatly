// client/src/pages/Orders.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import StatCard from '../components/StatCard.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { path } from '../routes.js';

const ACTIVE = ['placed', 'out_for_delivery'];

export default function Orders() {
  const { t, pick, money, lang } = useI18n();
  const orders = useApi('/orders');
  const mine = useApi('/impact/me');
  const [filter, setFilter] = useState('all');

  if (orders.loading) return <p>{t('common.loading')}</p>;
  if (orders.error)
    return (
      <p role="alert" className="text-chili">
        {orders.error.message}
      </p>
    );

  const num = (n) =>
    Number(n ?? 0).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US', { maximumFractionDigits: 1 });
  const imp = mine.data?.impact;
  const list = orders.data.orders.filter((o) =>
    filter === 'all'
      ? true
      : filter === 'active'
        ? ACTIVE.includes(o.status)
        : !ACTIVE.includes(o.status),
  );
  const chips = [
    ['all', pick('সব', 'All')],
    ['active', pick('চলমান', 'Active')],
    ['done', pick('শেষ হয়েছে', 'Finished')],
  ];

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-turmeric-deep">
            {pick('আপনার', 'Your')}
          </p>
          <h1 className="font-display text-4xl">{t('orders.title')}</h1>
        </div>
        <div className="flex gap-2">
          {chips.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className={`chip border px-3 py-1.5 ${filter === k ? 'border-leaf bg-leaf/15 text-leaf-dark' : 'border-jute-deep text-soil-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label={pick('মোট অর্ডার', 'Total orders')}
          value={num(orders.data.total ?? orders.data.orders.length)}
          color="text-soil"
        />
        <StatCard label={pick('রক্ষা করেছেন', 'Rescued')} value={`${num(imp?.kgRescued)} kg`} />
        <StatCard
          label={pick('সাশ্রয় হয়েছে', 'Saved')}
          value={money(imp?.savedBdt ?? 0)}
          color="text-turmeric-deep"
        />
      </div>

      {list.length === 0 && <p className="mt-6 text-soil-muted">{t('orders.empty')}</p>}
      <ul className="mt-5 space-y-3">
        {list.map((o) => {
          const boxes = o.items?.reduce((n, i) => n + i.qty, 0);
          return (
            <li key={o.code} className="crate-card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-[7rem]">
                <p className="font-mono font-semibold">{o.code}</p>
                {o.createdAt && (
                  <p className="text-xs text-soil-muted">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <StatusChip status={o.status} />
              {boxes != null && (
                <span className="text-sm text-soil-muted">
                  {boxes} {pick('টি বক্স', 'boxes')}
                </span>
              )}
              <span className="ml-auto text-lg font-semibold">{money(o.totalBdt)}</span>
              <Link to={path('order', { code: o.code })} className="btn-ghost text-sm">
                {ACTIVE.includes(o.status) ? pick('ট্র্যাক করুন', 'Track') : pick('দেখুন', 'View')}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
