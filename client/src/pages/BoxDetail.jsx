// client/src/pages/BoxDetail.jsx
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { useCart } from '../cart/CartContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { ROUTES } from '../routes.js';

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
  const saved = box.soldOut ? 0 : Math.max(0, box.bazarValueBdt - box.priceBdt);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
      <div>
        <nav className="text-sm text-soil-muted">
          <Link to={ROUTES.market} className="hover:text-leaf-dark">
            {t('market.title')}
          </Link>
          {' / '}
          <span className="capitalize">{box.tier}</span>
        </nav>
        <h1 className="mt-2 font-display text-4xl capitalize">
          {box.tier} · {box.weightKg} kg
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="chip border border-leaf/40 bg-leaf/10 text-leaf-dark">
            {box.lines.length} {pick('টি ফসল', 'kinds of produce')}
          </span>
          <span className="chip border border-crate/40 bg-crate/10 text-crate">{box.cityCode}</span>
          <span className="chip border border-jute-deep text-soil-muted">{box.date}</span>
        </div>

        <div className="crate-card mt-5 overflow-hidden">
          <div className="border-b border-jute-deep bg-jute px-4 py-3">
            <h2 className="font-semibold">{t('box.contents')}</h2>
          </div>
          <ul className="divide-y divide-jute-deep">
            {box.lines.map((l) => (
              <li key={l.produceSlug} className="flex items-center justify-between px-4 py-3">
                <span className="font-semibold">{pick(l.nameBn, l.nameEn)}</span>
                <span className="font-mono text-sm text-soil-muted">{l.kgPerBox} kg</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <aside className="crate-card p-5 lg:sticky lg:top-24">
        {box.soldOut ? (
          <p className="text-lg font-semibold text-chili">{t('box.soldOut')}</p>
        ) : (
          <>
            <p className="font-display text-5xl text-leaf-dark">{money(box.priceBdt)}</p>
            <p className="mt-1 text-soil-muted">
              <s>{money(box.bazarValueBdt)}</s>
            </p>
            <p className="mt-2 text-leaf-dark">
              {pick('আপনি বাঁচাচ্ছেন', 'You save')} {money(saved)} · {box.savingsPct}%
            </p>
            <p className="mt-1 text-sm text-soil-muted">
              {box.unitsAvailable}
              {t('box.left')}
            </p>
            <button
              className="btn-primary mt-5 w-full"
              onClick={() => dispatch({ type: 'add', box, cityCode: box.cityCode })}
            >
              {t('box.add')}
            </button>
            <p className="mt-3 text-center text-xs text-soil-muted">
              {t('pay.cod')} · {t('pay.wallet')}
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
