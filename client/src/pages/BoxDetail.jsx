// client/src/pages/BoxDetail.jsx
import { useParams } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { useCart } from '../cart/CartContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function BoxDetail() {
  const { code } = useParams();
  const { t, pick, money } = useI18n();
  const { dispatch } = useCart();
  const { data, error, loading } = useApi(`/boxes/${encodeURIComponent(code)}`);

  if (loading) return <p>{t('common.loading')}</p>;
  if (error)
    return (
      <p role="alert" className="text-chili">
        {error.message}
      </p>
    );
  const box = data.box;

  return (
    <article className="max-w-xl">
      <h1 className="font-display text-3xl capitalize">
        {box.tier} · {box.weightKg} kg
      </h1>
      <h2 className="mt-4 font-semibold">{t('box.contents')}</h2>
      <ul className="mt-2 divide-y divide-jute-deep rounded-lg bg-surface">
        {box.lines.map((l) => (
          <li key={l.produceSlug} className="flex justify-between px-3 py-2">
            <span>{pick(l.nameBn, l.nameEn)}</span>
            <span>{l.kgPerBox} kg</span>
          </li>
        ))}
      </ul>
      {box.soldOut ? (
        <p className="mt-4 text-chili">{t('box.soldOut')}</p>
      ) : (
        <>
          <p className="mt-4 text-2xl font-semibold">
            {money(box.priceBdt)}{' '}
            <s className="text-base font-normal text-soil-muted">{money(box.bazarValueBdt)}</s>
          </p>
          <button
            className="btn-primary mt-3"
            onClick={() => dispatch({ type: 'add', box, cityCode: box.cityCode })}
          >
            {t('box.add')}
          </button>
        </>
      )}
    </article>
  );
}
