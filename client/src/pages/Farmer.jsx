// client/src/pages/Farmer.jsx
import { post } from '../api/client.js';
import { useApi } from '../api/useApi.js';
import LotForm from '../components/LotForm.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function Farmer() {
  const { t, money } = useI18n();
  const earnings = useApi('/earnings');
  const lots = useApi('/lots');
  const s = earnings.data?.summary;

  async function withdraw(code) {
    await post(`/lots/${encodeURIComponent(code)}/withdraw`, {}).catch(() => {});
    lots.reload();
  }

  return (
    <section className="space-y-6">
      <h1 className="font-display text-3xl">{t('farmer.title')}</h1>

      {s && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['earn.total', money(s.farmerBdt)],
            ['earn.unpaid', money(s.unpaidBdt)],
            ['earn.paid', money(s.paidBdt)],
            ['earn.kg', s.kg],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white p-3">
              <p className="text-sm text-soil/60">{t(k)}</p>
              <p className="text-xl font-semibold">{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <LotForm
          onCreated={() => {
            lots.reload();
            earnings.reload();
          }}
        />
        <div>
          <h2 className="mb-2 font-display text-2xl">{t('lot.list')}</h2>
          {lots.data?.lots.length === 0 && <p>{t('lot.empty')}</p>}
          <ul className="space-y-2">
            {lots.data?.lots.map((l) => (
              <li key={l.code} className="rounded-lg bg-white p-3 text-sm">
                <div className="flex justify-between font-semibold">
                  <span>
                    {l.code} · {l.produceSlug} · {t('triage.grade')} {l.grade}
                  </span>
                  <span>{t(`lotstatus.${l.status}`)}</span>
                </div>
                <p>
                  {l.soldKg}/{l.quantityKg} kg · {money(l.priceBdt)}/kg · {t('lot.floor')}{' '}
                  {money(l.farmerFloorBdt)} · {l.hoursToExpiry}h
                </p>
                {l.status === 'listed' && (
                  <button className="mt-1 text-chili" onClick={() => withdraw(l.code)}>
                    {t('lot.withdraw')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
