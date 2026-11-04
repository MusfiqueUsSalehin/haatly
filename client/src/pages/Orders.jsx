// client/src/pages/Orders.jsx
import { Link } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { path } from '../routes.js';

export default function Orders() {
  const { t, money } = useI18n();
  const { data, error, loading } = useApi('/orders');
  if (loading) return <p>{t('common.loading')}</p>;
  if (error)
    return (
      <p role="alert" className="text-chili">
        {error.message}
      </p>
    );

  return (
    <section className="max-w-xl">
      <h1 className="mb-4 font-display text-3xl">{t('orders.title')}</h1>
      {data.orders.length === 0 && <p>{t('orders.empty')}</p>}
      <ul className="space-y-2">
        {data.orders.map((o) => (
          <li key={o.code}>
            <Link
              to={path('order', { code: o.code })}
              className="flex justify-between rounded-lg bg-white px-3 py-3 hover:bg-white/70"
            >
              <span>{o.code}</span>
              <span>
                {t(`status.${o.status}`)} · {money(o.totalBdt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
