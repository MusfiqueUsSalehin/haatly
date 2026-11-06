// client/src/components/LotForm.jsx
import { useState } from 'react';
import { post } from '../api/client.js';
import { useApi } from '../api/useApi.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { photoToPayload } from '../lib/photo.js';

// Same list as the server's DEFECT_NAMES: the server rejects anything else.
const DEFECTS = [
  'misshapen',
  'oversized',
  'undersized',
  'blemish',
  'discoloured',
  'bruise',
  'soft',
  'wilted',
  'sprouting',
  'cracked',
  'insect_damage',
  'rot',
  'mould',
  'slime',
];

export default function LotForm({ onCreated }) {
  const { t, pick, money } = useI18n();
  const produce = useApi('/catalog/produce');
  const hubs = useApi('/catalog/hubs?kind=collection');
  const [form, setForm] = useState({ produceSlug: '', hubCode: '', quantityKg: '' });
  const [defects, setDefects] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [triage, setTriage] = useState(null);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Any change makes an earlier grade result stale.
  const stale = () => {
    setTriage(null);
    setCreated(null);
  };
  const toggle = (d) => {
    setDefects((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
    stale();
  };

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const body = () => ({
    produceSlug: form.produceSlug,
    defectTags: defects,
    ...(photo && { photo }),
  });

  const check = (e) => {
    e.preventDefault();
    return run(async () => setTriage((await post('/ai/triage', body())).triage));
  };

  const submit = () =>
    run(async () => {
      const res = await post('/lots', {
        ...body(),
        hubCode: form.hubCode,
        quantityKg: Number(form.quantityKg),
      });
      setCreated(res.lot);
      setTriage(null);
      onCreated();
    });

  const ready = form.produceSlug && form.hubCode && Number(form.quantityKg) >= 1;

  return (
    <form onSubmit={check} className="space-y-3 rounded-xl bg-surface p-4">
      <h2 className="font-display text-2xl">{t('lot.new')}</h2>
      <select
        className="input"
        required
        value={form.produceSlug}
        aria-label={t('lot.produce')}
        onChange={(e) => {
          set('produceSlug')(e);
          stale();
        }}
      >
        <option value="">{t('lot.produce')}</option>
        {produce.data?.produce.map((p) => (
          <option key={p.slug} value={p.slug}>
            {pick(p.nameBn, p.nameEn)}
          </option>
        ))}
      </select>
      <select
        className="input"
        required
        value={form.hubCode}
        onChange={set('hubCode')}
        aria-label={t('lot.hub')}
      >
        <option value="">{t('lot.hub')}</option>
        {hubs.data?.hubs.map((h) => (
          <option key={h.code} value={h.code}>
            {pick(h.nameBn, h.nameEn)}
          </option>
        ))}
      </select>
      <input
        className="input"
        type="number"
        min="1"
        max="5000"
        required
        placeholder={t('lot.qty')}
        value={form.quantityKg}
        onChange={set('quantityKg')}
      />

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">{t('lot.defects')}</legend>
        <div className="flex flex-wrap gap-2">
          {DEFECTS.map((d) => (
            <label
              key={d}
              className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${defects.includes(d) ? 'border-leaf bg-leaf text-jute-light' : 'border-jute-deep'}`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={defects.includes(d)}
                onChange={() => toggle(d)}
              />
              {t(`defect.${d}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm">
        {t('lot.photo')}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="mt-1 block"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setPhoto(file ? await photoToPayload(file).catch(() => null) : null);
            stale();
          }}
        />
      </label>

      <button className="btn-ghost w-full" disabled={busy || !form.produceSlug}>
        {t('lot.check')}
      </button>

      {triage && (
        <div className="rounded-lg border border-jute-deep p-3">
          <p className="text-lg font-semibold">
            {triage.sellable
              ? `${t('triage.grade')} ${triage.grade} · ${triage.shelfLifeDays} ${t('triage.days')}`
              : t('triage.unsafe')}
          </p>
          <p className="text-sm text-soil-muted">
            {triage.notes.map((n) => t(`triage.${n}`)).join(' · ')}
          </p>
          {triage.defects.length > 0 && (
            <p className="text-sm">{triage.defects.map((d) => t(`defect.${d}`)).join(', ')}</p>
          )}
          {triage.sellable && (
            <button
              type="button"
              className="btn-primary mt-3 w-full"
              disabled={busy || !ready}
              onClick={submit}
            >
              {t('lot.submit')}
            </button>
          )}
        </div>
      )}

      {created && (
        <p className="rounded-lg bg-leaf/10 p-3 text-sm">
          {t('lot.created')}: {created.code} · {t('lot.price')} {money(created.priceBdt)} ·{' '}
          {t('lot.floor')} {money(created.farmerFloorBdt)}
        </p>
      )}
      {error && (
        <p role="alert" className="text-chili">
          {error}
        </p>
      )}
    </form>
  );
}
