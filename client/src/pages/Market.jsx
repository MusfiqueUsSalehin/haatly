// client/src/pages/Market.jsx
import BoxCard from '../components/BoxCard.jsx';
import { useApi } from '../api/useApi.js';
import { useCity } from '../city/CityContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function Market() {
  const { t } = useI18n();
  const { city } = useCity();
  const { data, error, loading } = useApi(city ? `/boxes?city=${city.code}` : null);

  return (
    <section>
      <h1 className="mb-4 font-display text-3xl">{t('market.title')}</h1>
      {loading && <p>{t('common.loading')}</p>}
      {error && (
        <p role="alert" className="text-chili">
          {error.message}
        </p>
      )}
      {data?.boxes.length === 0 && <p>{t('market.empty')}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.boxes.map((b) => (
          <BoxCard key={b.code} box={b} cityCode={city.code} />
        ))}
      </div>
    </section>
  );
}
