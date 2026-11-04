// client/src/components/BoxCard.jsx
import { Link } from 'react-router-dom';
import { useCart } from '../cart/CartContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { path } from '../routes.js';

export default function BoxCard({ box, cityCode }) {
  const { t, money } = useI18n();
  const { dispatch } = useCart();
  return (
    <article className="rounded-xl border border-soil/10 bg-white p-4">
      <Link
        to={path('box', { code: box.code })}
        className="font-display text-2xl capitalize text-leaf"
      >
        {box.tier} · {box.weightKg} kg
      </Link>
      {box.soldOut ? (
        <p className="mt-2 text-chili">{t('box.soldOut')}</p>
      ) : (
        <>
          <p className="mt-2 text-xl font-semibold">
            {money(box.priceBdt)}{' '}
            <s className="text-sm font-normal text-soil/50">{money(box.bazarValueBdt)}</s>
          </p>
          <p className="text-sm text-leaf">
            {box.savingsPct}% {t('box.save')} · {box.unitsAvailable}
            {t('box.left')}
          </p>
          <button
            className="btn-primary mt-3 w-full"
            onClick={() => dispatch({ type: 'add', box, cityCode })}
          >
            {t('box.add')}
          </button>
        </>
      )}
    </article>
  );
}
