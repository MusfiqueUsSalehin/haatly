// client/src/pages/Checkout.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCart } from '../cart/CartContext.jsx';
import { useCity } from '../city/CityContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { deliveryFee } from '../lib/fees.js';
import { ROUTES, path } from '../routes.js';

export default function Checkout() {
  const { t, pick, money } = useI18n();
  const { user } = useAuth();
  const { items, cityCode, subtotalBdt, dispatch } = useCart();
  const { cities } = useCity();
  const navigate = useNavigate();
  const zones = cities.find((c) => c.code === cityCode)?.zones ?? [];

  const [form, setForm] = useState({
    recipientName: user?.name ?? '',
    phone: user?.phone ?? '',
    zoneCode: '',
    line: '',
    landmark: '',
    paymentMethod: 'cod',
  });
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  if (items.length === 0) {
    return (
      <div className="py-16 text-center">
        <Link to={ROUTES.market} className="btn-primary">
          {t('nav.market')}
        </Link>
      </div>
    );
  }

  async function refreshPrices() {
    const { boxes } = await get(`/boxes?city=${cityCode}`);
    dispatch({
      type: 'reprice',
      prices: Object.fromEntries(boxes.map((b) => [b.code, b.soldOut ? null : b.priceBdt])),
    });
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const { order, payment } = await post('/orders', {
        recipientName: form.recipientName,
        phone: form.phone,
        zoneCode: form.zoneCode,
        address: { line: form.line, ...(form.landmark && { landmark: form.landmark }) },
        paymentMethod: form.paymentMethod,
        items: items.map((i) => ({
          boxCode: i.boxCode,
          qty: i.qty,
          seenUnitPriceBdt: i.unitPriceBdt,
        })),
      });
      dispatch({ type: 'clear' });
      // Only follow our own sandbox page: never a server-supplied absolute URL.
      const next = payment.payUrl?.startsWith('/sandbox/pay/')
        ? payment.payUrl
        : path('order', { code: order.code });
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
      setFields(err.details ?? {});
      if (['price_changed', 'stock_changed', 'box_not_found'].includes(err.code)) {
        await refreshPrices().catch(() => {}); // show the customer the current prices
      }
    } finally {
      setBusy(false);
    }
  }

  const fee = deliveryFee(subtotalBdt);
  const err = (k) => fields[k] && <p className="mt-1 text-sm text-chili">{String(fields[k])}</p>;
  const methods = [
    ['cod', t('pay.cod'), pick('রাইডারকে হাতে দিন', 'Pay the rider in cash')],
    ['wallet', t('pay.wallet'), pick('অনলাইনে পরিশোধ', 'Pay online')],
  ];

  return (
    <form onSubmit={submit} className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-5">
        <h1 className="font-display text-4xl">{t('cart.checkout')}</h1>

        <section className="crate-card space-y-4 p-5">
          <h2 className="font-display text-2xl">{pick('ডেলিভারি ঠিকানা', 'Delivery address')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="rn">
                {t('checkout.name')}
              </label>
              <input
                id="rn"
                className="input"
                required
                value={form.recipientName}
                onChange={set('recipientName')}
              />
              {err('recipientName')}
            </div>
            <div>
              <label className="label" htmlFor="ph">
                {t('checkout.phone')}
              </label>
              <input
                id="ph"
                className="input"
                required
                inputMode="tel"
                value={form.phone}
                onChange={set('phone')}
              />
              {err('phone')}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="zn">
              {t('checkout.zone')}
            </label>
            <select
              id="zn"
              className="input"
              required
              value={form.zoneCode}
              onChange={set('zoneCode')}
            >
              <option value="" />
              {zones.map((z) => (
                <option key={z.code} value={z.code}>
                  {pick(z.nameBn, z.nameEn)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ad">
              {t('checkout.address')}
            </label>
            <input
              id="ad"
              className="input"
              required
              minLength={5}
              value={form.line}
              onChange={set('line')}
            />
            {err('address')}
          </div>
          <div>
            <label className="label" htmlFor="lm">
              {t('checkout.landmark')}
            </label>
            <input id="lm" className="input" value={form.landmark} onChange={set('landmark')} />
          </div>
        </section>

        <section className="crate-card p-5">
          <h2 className="font-display text-2xl">{t('checkout.payment')}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {methods.map(([value, label, hint]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${form.paymentMethod === value ? 'border-leaf bg-leaf/10' : 'border-jute-deep'}`}
              >
                <input
                  type="radio"
                  name="pay"
                  className="mt-1 accent-leaf"
                  checked={form.paymentMethod === value}
                  onChange={() => setForm({ ...form, paymentMethod: value })}
                />
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="text-sm text-soil-muted">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-sm text-soil-muted">
            {pick(
              'ডেলিভারির সময় রাইডারকে ৬ সংখ্যার কোড বলতে হবে।',
              'You give the rider a 6-digit code when the box arrives.',
            )}
          </p>
        </section>
      </div>

      <aside className="crate-card p-5 lg:sticky lg:top-24">
        <h2 className="font-display text-2xl">{pick('সারসংক্ষেপ', 'Order summary')}</h2>
        <ul className="mt-3 divide-y divide-jute-deep text-sm">
          {items.map((i) => (
            <li key={i.boxCode} className="flex justify-between py-1.5">
              <span className="capitalize">
                {i.tier} × {i.qty}
              </span>
              <span>{money(i.qty * i.unitPriceBdt)}</span>
            </li>
          ))}
          <li className="flex justify-between py-1.5">
            <span>{t('checkout.fee')}</span>
            <span>{fee === 0 ? t('checkout.free') : money(fee)}</span>
          </li>
        </ul>
        <p className="mt-3 flex items-baseline justify-between border-t border-jute-deep pt-3">
          <span className="font-semibold">{pick('মোট দিতে হবে', 'To pay')}</span>
          <span className="font-display text-4xl text-leaf-dark">{money(subtotalBdt + fee)}</span>
        </p>
        {error && (
          <p role="alert" className="mt-3 text-chili">
            {error}
          </p>
        )}
        <button className="btn-primary mt-4 w-full" disabled={busy}>
          {t('checkout.place')} · {money(subtotalBdt + fee)}
        </button>
        <p className="mt-2 text-center text-xs text-soil-muted">
          {pick(
            'অর্ডার করলেই কৃষকের দাম নিশ্চিত হয়ে যায়',
            'Ordering locks in the farmer’s price',
          )}
        </p>
      </aside>
    </form>
  );
}
