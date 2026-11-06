// client/src/pages/Cart.jsx
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { MAX_QTY, useCart } from '../cart/CartContext.jsx';
import Icon from '../components/Icon.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { FREE_DELIVERY_FROM_BDT, deliveryFee } from '../lib/fees.js';
import { ROUTES } from '../routes.js';

export default function Cart() {
  const { t, pick, money } = useI18n();
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
      <div className="py-16 text-center">
        <p className="font-display text-3xl">{t('cart.empty')}</p>
        <Link to={ROUTES.market} className="btn-primary mt-5">
          {t('nav.market')}
        </Link>
      </div>
    );
  }

  const fee = deliveryFee(subtotalBdt);
  const saved = items.reduce(
    (n, i) => n + i.qty * Math.max(0, (i.bazarValueBdt ?? i.unitPriceBdt) - i.unitPriceBdt),
    0,
  );
  const kg = items.reduce((n, i) => n + i.qty * i.weightKg, 0);
  const boxes = items.reduce((n, i) => n + i.qty, 0);
  const row = 'flex justify-between py-1.5 text-sm';

  return (
    <div>
      <h1 className="font-display text-4xl">{t('cart.title')}</h1>
      <p className="mt-1 text-soil-muted">
        {boxes} {pick('টি বক্স', 'boxes')} · {kg} kg
      </p>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <ul className="crate-card divide-y divide-jute-deep overflow-hidden">
          {items.map((i) => {
            const itemSaved =
              i.qty * Math.max(0, (i.bazarValueBdt ?? i.unitPriceBdt) - i.unitPriceBdt);
            return (
              <li key={i.boxCode} className="flex flex-wrap items-center gap-3 p-4">
                <span className="grid h-12 w-12 place-items-center rounded-lg bg-crate-light text-crate">
                  <Icon name="cart" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold capitalize">
                    {i.tier} · {i.weightKg} kg
                  </p>
                  {itemSaved > 0 && (
                    <p className="text-sm text-leaf-dark">
                      {money(itemSaved)} {t('box.save')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="btn-ghost h-9 w-9 !p-0"
                    disabled={i.qty <= 1}
                    aria-label="-"
                    onClick={() => dispatch({ type: 'setQty', boxCode: i.boxCode, qty: i.qty - 1 })}
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-mono">{i.qty}</span>
                  <button
                    className="btn-ghost h-9 w-9 !p-0"
                    disabled={i.qty >= MAX_QTY}
                    aria-label="+"
                    onClick={() => dispatch({ type: 'setQty', boxCode: i.boxCode, qty: i.qty + 1 })}
                  >
                    +
                  </button>
                </div>
                <span className="w-20 text-right text-lg font-semibold">
                  {money(i.qty * i.unitPriceBdt)}
                </span>
                <button
                  className="text-soil-muted hover:text-chili"
                  aria-label={t('cart.remove')}
                  onClick={() => dispatch({ type: 'remove', boxCode: i.boxCode })}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>

        <aside className="crate-card p-5 lg:sticky lg:top-24">
          <h2 className="font-display text-2xl">{pick('হিসাব', 'Summary')}</h2>
          <div className="mt-3 divide-y divide-jute-deep">
            <p className={row}>
              <span>{t('checkout.subtotal')}</span>
              <span>{money(subtotalBdt)}</span>
            </p>
            <p className={row}>
              <span>{t('checkout.fee')}</span>
              <span>{fee === 0 ? t('checkout.free') : money(fee)}</span>
            </p>
            {saved > 0 && (
              <p className={`${row} text-leaf-dark`}>
                <span>{pick('কাঁচাবাজারের চেয়ে সাশ্রয়', 'Saved vs kacha bazar')}</span>
                <span>− {money(saved)}</span>
              </p>
            )}
          </div>
          <p className="mt-3 flex items-baseline justify-between border-t border-jute-deep pt-3">
            <span className="font-semibold">{t('cart.total')}</span>
            <span className="font-display text-4xl text-leaf-dark">{money(subtotalBdt + fee)}</span>
          </p>
          {fee > 0 && (
            <p className="mt-2 text-xs text-soil-muted">
              {pick(
                `আরও ${money(FREE_DELIVERY_FROM_BDT - subtotalBdt)} যোগ করলে ডেলিভারি ফ্রি`,
                `Add ${money(FREE_DELIVERY_FROM_BDT - subtotalBdt)} more for free delivery`,
              )}
            </p>
          )}
          <Link to={ROUTES.checkout} className="btn-primary mt-4 w-full">
            {t('cart.checkout')}
          </Link>
          <Link to={ROUTES.market} className="btn-ghost mt-2 w-full">
            {pick('আরও কিছু যোগ করি', 'Add more')}
          </Link>
        </aside>
      </div>
    </div>
  );
}
