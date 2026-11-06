// client/src/pages/Market.jsx
import { useApi } from '../api/useApi.js';
import BoxCard from '../components/BoxCard.jsx';
import { useCity } from '../city/CityContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function Market() {
  const { t, pick } = useI18n();
  const { cities, city, setCode } = useCity();
  const { data, error, loading } = useApi(city ? `/boxes?city=${city.code}` : null);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-turmeric-deep">
            {pick('আজ হাবে যা আছে', 'What’s on the shelf today')}
          </p>
          <h1 className="mt-1 font-display text-4xl">{t('market.title')}</h1>
        </div>
        <div className="flex gap-2" role="group" aria-label={t('city.label')}>
          {cities.map((c) => (
            <button
              key={c.code}
              onClick={() => setCode(c.code)}
              aria-pressed={city?.code === c.code}
              className={`chip border px-3 py-1.5 ${city?.code === c.code ? 'border-leaf bg-leaf/15 text-leaf-dark' : 'border-jute-deep text-soil-muted hover:text-soil'}`}
            >
              {pick(c.nameBn, c.nameEn)}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="mt-6">{t('common.loading')}</p>}
      {error && (
        <p role="alert" className="mt-6 text-chili">
          {error.message}
        </p>
      )}
      {data?.boxes.length === 0 && <p className="mt-6 text-soil-muted">{t('market.empty')}</p>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.boxes.map((b) => (
          <BoxCard key={b.code} box={b} cityCode={city.code} />
        ))}
      </div>
    </section>
  );
}
