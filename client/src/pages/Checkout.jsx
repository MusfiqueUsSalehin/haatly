// client/src/pages/Checkout.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCart } from '../cart/CartContext.jsx';
import { useCity } from '../city/CityContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { ROUTES, path } from '../routes.js';

// Display estimate only: the server decides the real fee (see DELIVERY_FEE_BDT in the API).
const feeFor = (subtotal) => (subtotal >= 500 ? 0 : 40);

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
      <p className="py-12 text-center">
        <Link to={ROUTES.market} className="text-crate">
          {t('nav.market')}
        </Link>
      </p>
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

  const fee = feeFor(subtotalBdt);
  const err = (k) => fields[k] && <p className="text-sm text-chili">{String(fields[k])}</p>;

  return (
    <form onSubmit={submit} className="max-w-md space-y-3">
      <h1 className="font-display text-3xl">{t('cart.checkout')}</h1>
      <input
        className="input"
        required
        placeholder={t('checkout.name')}
        value={form.recipientName}
        onChange={set('recipientName')}
      />
      {err('recipientName')}
      <input
        className="input"
        required
        inputMode="tel"
        placeholder={t('checkout.phone')}
        value={form.phone}
        onChange={set('phone')}
      />
      {err('phone')}
      <select
        className="input"
        required
        value={form.zoneCode}
        onChange={set('zoneCode')}
        aria-label={t('checkout.zone')}
      >
        <option value="">{t('checkout.zone')}</option>
        {zones.map((z) => (
          <option key={z.code} value={z.code}>
            {pick(z.nameBn, z.nameEn)}
          </option>
        ))}
      </select>
      <input
        className="input"
        required
        minLength={5}
        placeholder={t('checkout.address')}
        value={form.line}
        onChange={set('line')}
      />
      <input
        className="input"
        placeholder={t('checkout.landmark')}
        value={form.landmark}
        onChange={set('landmark')}
      />
      <select
        className="input"
        value={form.paymentMethod}
        onChange={set('paymentMethod')}
        aria-label={t('checkout.payment')}
      >
        <option value="cod">{t('pay.cod')}</option>
        <option value="wallet">{t('pay.wallet')}</option>
      </select>
      <div className="rounded-lg bg-surface p-3 text-sm">
        <p>
          {t('checkout.subtotal')}: {money(subtotalBdt)}
        </p>
        <p>
          {t('checkout.fee')}: {fee === 0 ? t('checkout.free') : money(fee)}
        </p>
        <p className="font-semibold">
          {t('cart.total')}: {money(subtotalBdt + fee)}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-chili">
          {error}
        </p>
      )}
      <button className="btn-primary w-full" disabled={busy}>
        {t('checkout.place')}
      </button>
    </form>
  );
}
