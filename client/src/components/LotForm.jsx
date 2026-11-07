// client/src/components/LotForm.jsx
import { useState } from 'react';
import { post } from '../api/client.js';
import { useApi } from '../api/useApi.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { photoToPayload } from '../lib/photo.js';
import AiBadge from './AiBadge.jsx';

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

const Tile = ({ label, value, color }) => (
  <div className="rounded-lg bg-sunken p-3 text-center">
    <p className="text-xs text-soil-muted">{label}</p>
    <p className={`font-display text-3xl ${color}`}>{value}</p>
  </div>
);

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
  const [source, setSource] = useState(null);
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
    return run(async () => {
      const res = await post('/ai/triage', body());
      setTriage(res.triage);
      setSource(res.source);
    });
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
    <form onSubmit={check} className="crate-card space-y-4 p-5">
      <div>
        <h2 className="font-display text-2xl">{t('lot.new')}</h2>
        <p className="text-sm text-soil-muted">
          {pick(
            'ফসল আর ত্রুটি জানান, ছবি দিলে আরও ভালো; গ্রেড আর টিকে থাকার সময় ঠিক হবে।',
            'Tell us the produce and any defects (a photo helps); we set the grade and shelf life.',
          )}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="lp">
            {t('lot.produce')}
          </label>
          <select
            id="lp"
            className="input"
            required
            value={form.produceSlug}
            onChange={(e) => {
              set('produceSlug')(e);
              stale();
            }}
          >
            <option value="" />
            {produce.data?.produce.map((p) => (
              <option key={p.slug} value={p.slug}>
                {pick(p.nameBn, p.nameEn)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="lq">
            {t('lot.qty')}
          </label>
          <input
            id="lq"
            className="input"
            type="number"
            min="1"
            max="5000"
            required
            value={form.quantityKg}
            onChange={set('quantityKg')}
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="lh">
          {t('lot.hub')}
        </label>
        <select id="lh" className="input" required value={form.hubCode} onChange={set('hubCode')}>
          <option value="" />
          {hubs.data?.hubs.map((h) => (
            <option key={h.code} value={h.code}>
              {pick(h.nameBn, h.nameEn)}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="label">{t('lot.defects')}</legend>
        <div className="flex flex-wrap gap-2">
          {DEFECTS.map((d) => (
            <label
              key={d}
              className={`chip cursor-pointer border px-3 py-1.5 ${defects.includes(d) ? 'border-leaf bg-leaf text-jute-light' : 'border-jute-deep text-soil-muted'}`}
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

      <label className="block rounded-lg border border-dashed border-jute-deep p-3 text-sm">
        <span className="font-semibold">{t('lot.photo')}</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="mt-1 block w-full text-soil-muted"
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
        <div
          className={`rounded-crate border p-4 ${triage.sellable ? 'border-leaf/50 bg-leaf/10' : 'border-chili/50 bg-chili/10'}`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            {photo && source === 'rules' ? (
              <p className="text-xs text-soil-muted">
                {pick(
                  'ছবি এআই দিয়ে যাচাই হয়নি; আপনার টিক করা ত্রুটি দিয়ে গ্রেড হয়েছে।',
                  'The photo was not AI-checked; the grade uses the defects you ticked.',
                )}
              </p>
            ) : (
              <span />
            )}
            <AiBadge source={source} />
          </div>
          {triage.sellable ? (
            <div className="grid grid-cols-2 gap-3">
              <Tile label={t('triage.grade')} value={triage.grade} color="text-leaf-dark" />
              <Tile
                label={pick('টিকবে', 'Stays fresh')}
                value={`${triage.shelfLifeDays} ${t('triage.days')}`}
                color="text-turmeric-deep"
              />
            </div>
          ) : (
            <p className="font-display text-2xl text-chili">{t('triage.unsafe')}</p>
          )}
          <p className="mt-3 text-sm text-soil-muted">
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
        <div className="rounded-lg border border-leaf/40 bg-leaf/10 p-3 text-sm">
          <p className="font-semibold text-leaf-dark">
            {t('lot.created')}: <span className="font-mono">{created.code}</span>
          </p>
          <p>
            {t('lot.price')} {money(created.priceBdt)} · {t('lot.floor')}{' '}
            {money(created.farmerFloorBdt)}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-chili">
          {error}
        </p>
      )}
    </form>
  );
}
