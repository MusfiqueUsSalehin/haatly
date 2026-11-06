// client/src/pages/Impact.jsx
import { useApi } from '../api/useApi.js';
import { useAuth } from '../auth/AuthContext.jsx';
import StatCard from '../components/StatCard.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function Impact() {
  const { t, pick, money, lang } = useI18n();
  const { user } = useAuth();
  const network = useApi('/impact');
  const mine = useApi(user?.role === 'customer' ? '/impact/me' : null);

  if (network.loading) return <p>{t('common.loading')}</p>;
  if (network.error)
    return (
      <p role="alert" className="text-chili">
        {network.error.message}
      </p>
    );

  const num = (n) =>
    Number(n ?? 0).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US', { maximumFractionDigits: 1 });
  const all = network.data.impact;
  const me = mine.data?.impact;

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs font-semibold tracking-wide text-turmeric-deep">
          {me ? pick('আপনার হিসাব', 'Your numbers') : pick('হাটলির হিসাব', 'The network')}
        </p>
        <h1 className="mt-1 font-display text-4xl">
          {me
            ? pick('আপনি এ পর্যন্ত যা বাঁচিয়েছেন', 'What you have saved so far')
            : t('impact.title')}
        </h1>
        <p className="mt-1 text-soil-muted">{t('impact.note')}</p>
      </div>

      {me && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t('impact.kg')}
            value={`${num(me.kgRescued)} kg`}
            hint={`${num(mine.data.orders)} ${pick('টি অর্ডারে', 'orders')}`}
          />
          <StatCard
            label={t('impact.co2')}
            value={`${num(me.co2eKg)} kg`}
            color="text-turmeric-deep"
          />
          <StatCard label={t('impact.saved')} value={money(me.savedBdt ?? 0)} color="text-crate" />
          <StatCard
            label={t('impact.earned')}
            value={money(me.farmerEarningsBdt ?? 0)}
            color="text-soil"
          />
        </div>
      )}

      <div>
        <h2 className="mb-3 font-display text-2xl">{t('impact.sub')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label={t('impact.orders')} value={num(all.ordersDelivered)} color="text-soil" />
          <StatCard label={t('impact.kg')} value={`${num(all.kgRescued)} kg`} />
          <StatCard
            label={t('impact.co2')}
            value={`${num(all.co2eKg)} kg`}
            color="text-turmeric-deep"
          />
          <StatCard label={t('impact.saved')} value={money(all.savedBdt ?? 0)} color="text-crate" />
          <StatCard
            label={t('impact.farmers')}
            value={num(all.farmersEarning)}
            color="text-turmeric-deep"
          />
          <StatCard
            label={t('impact.earned')}
            value={money(all.farmerEarningsBdt ?? 0)}
            color="text-soil"
          />
        </div>
      </div>

      <details className="crate-card p-5">
        <summary className="cursor-pointer font-display text-xl">{t('impact.assumptions')}</summary>
        <p className="mt-2 text-sm text-turmeric-deep">
          {pick('এগুলো পরিমাপ নয়, আনুমানিক গড়।', 'These are estimates, not measurements.')}
        </p>
        <ul className="mt-3 space-y-1 font-mono text-xs text-soil-muted">
          {Object.entries(network.data.assumptions ?? {}).map(([k, v]) => (
            <li key={k}>
              {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
