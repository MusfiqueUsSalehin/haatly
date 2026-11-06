// client/src/pages/Impact.jsx  (public: no sign-in needed)
import { useApi } from '../api/useApi.js';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function Impact() {
  const { t, lang, money } = useI18n();
  const { data, error, loading } = useApi('/impact');
  if (loading) return <p>{t('common.loading')}</p>;
  if (error)
    return (
      <p role="alert" className="text-chili">
        {error.message}
      </p>
    );

  const num = (n) =>
    Number(n).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US', { maximumFractionDigits: 1 });
  const i = data.impact;
  const cards = [
    ['impact.orders', num(i.ordersDelivered)],
    ['impact.kg', num(i.kgRescued)],
    ['impact.saved', money(i.savedBdt)],
    ['impact.co2', num(i.co2eKg)],
    ['impact.farmers', num(i.farmersEarning)],
    ['impact.earned', money(i.farmerEarningsBdt)],
  ];

  return (
    <section className="space-y-6 py-6 text-center">
      <h1 className="font-display text-4xl text-leaf">{t('impact.title')}</h1>
      <p>{t('impact.sub')}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-surface p-4">
            <p className="text-3xl font-semibold text-leaf">{v}</p>
            <p className="text-sm text-soil-muted">{t(k)}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-soil-muted">{t('impact.note')}</p>
      <details className="mx-auto max-w-md text-left text-sm">
        <summary className="cursor-pointer">{t('impact.assumptions')}</summary>
        <ul className="mt-2 space-y-1">
          {Object.entries(data.assumptions ?? {}).map(([k, v]) => (
            <li key={k}>
              {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
