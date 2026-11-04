// client/src/pages/Cart.jsx
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { useCart } from '../cart/CartContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { ROUTES } from '../routes.js';

export default function Cart() {
  const { t, money } = useI18n();
  const { items, cityCode, subtotalBdt, dispatch } = useCart();
  // Prices only ever go down on the server: refresh them, and drop boxes no longer for sale.
  const { data } = useApi(cityCode && items.length ? `/boxes?city=${cityCode}` : null);

  useEffect(() => {
    if (!data) return;
    const prices = Object.fromEntries(
      data.boxes.map((b) => [b.code, b.soldOut ? null : b.priceBdt]),
    );
    dispatch({ type: 'reprice', prices });
  }, [data, dispatch]);

  if (items.length === 0) {
    return (
      <p className="py-12 text-center">
        {t('cart.empty')} ·{' '}
        <Link to={ROUTES.market} className="text-crate">
          {t('nav.market')}
        </Link>
      </p>
    );
  }

  return (
    <section className="max-w-xl">
      <h1 className="mb-4 font-display text-3xl">{t('cart.title')}</h1>
      <ul className="divide-y divide-soil/10 rounded-lg bg-white">
        {items.map((i) => (
          <li key={i.boxCode} className="flex items-center gap-3 px-3 py-3">
            <span className="flex-1 capitalize">
              {i.tier} · {i.weightKg} kg
            </span>
            <input
              type="number"
              min="1"
              max="10"
              className="input w-16"
              value={i.qty}
              aria-label="qty"
              onChange={(e) =>
                dispatch({ type: 'setQty', boxCode: i.boxCode, qty: Number(e.target.value) || 1 })
              }
            />
            <span className="w-20 text-right">{money(i.qty * i.unitPriceBdt)}</span>
            <button
              className="text-chili"
              onClick={() => dispatch({ type: 'remove', boxCode: i.boxCode })}
            >
              {t('cart.remove')}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xl font-semibold">
        {t('cart.total')}: {money(subtotalBdt)}
      </p>
      <Link to={ROUTES.checkout} className="btn-primary mt-4">
        {t('cart.checkout')}
      </Link>
    </section>
  );
}
