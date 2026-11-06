// client/src/components/BoxCard.jsx
import { Link } from 'react-router-dom';
import { useCart } from '../cart/CartContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { path } from '../routes.js';

export default function BoxCard({ box, cityCode }) {
  const { t, pick, money } = useI18n();
  const { dispatch } = useCart();
  const detail = path('box', { code: box.code });

  return (
    <article className="crate-card flex flex-col p-4">
      <div className="flex items-center justify-between">
        <span className="chip bg-jute capitalize text-soil-muted">{box.tier}</span>
        <span className="text-sm text-soil-muted">{box.weightKg} kg</span>
      </div>
      <Link to={detail} className="mt-3 font-display text-2xl capitalize hover:text-leaf-dark">
        {box.tier} · {box.weightKg} kg
      </Link>

      {box.lines?.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {box.lines.slice(0, 5).map((l) => (
            <li key={l.produceSlug} className="chip border border-jute-deep text-soil">
              {pick(l.nameBn, l.nameEn)}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-end justify-between border-t border-jute-deep pt-3">
        <p className="text-3xl font-semibold text-leaf-dark">
          {money(box.priceBdt)}{' '}
          <s className="text-sm font-normal text-soil-muted">{money(box.bazarValueBdt)}</s>
        </p>
        <span className="chip border border-leaf/40 bg-leaf/10 text-leaf-dark">
          {box.savingsPct}% {t('box.save')}
        </span>
      </div>

      {box.soldOut ? (
        <p className="mt-3 font-semibold text-chili">{t('box.soldOut')}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-soil-muted">
            {box.unitsAvailable}
            {t('box.left')}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              className="btn-primary flex-1"
              onClick={() => dispatch({ type: 'add', box, cityCode })}
            >
              {t('box.add')}
            </button>
            <Link to={detail} className="btn-ghost">
              {pick('দেখুন', 'View')}
            </Link>
          </div>
        </>
      )}
    </article>
  );
}
