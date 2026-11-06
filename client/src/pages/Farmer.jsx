// client/src/pages/Farmer.jsx
import { post } from '../api/client.js';
import { useApi } from '../api/useApi.js';
import { useAuth } from '../auth/AuthContext.jsx';
import ForecastPanel from '../components/ForecastPanel.jsx';
import LotForm from '../components/LotForm.jsx';
import StatCard from '../components/StatCard.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';

// Hours left, shown as a bar: a heuristic against a four-day window, red when nearly gone.
function ShelfBar({ hours }) {
  const pct = Math.max(4, Math.min(100, (hours / 96) * 100));
  const tone = hours < 12 ? 'bg-chili' : hours < 36 ? 'bg-turmeric' : 'bg-leaf';
  return (
    <div className="w-28">
      <div className="h-1.5 rounded-full bg-jute">
        <div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-soil-muted">{hours}h</p>
    </div>
  );
}

export default function Farmer() {
  const { t, pick, money, lang } = useI18n();
  const { user } = useAuth();
  const earnings = useApi('/earnings');
  const lots = useApi('/lots');
  const produce = useApi('/catalog/produce');
  const s = earnings.data?.summary;
  const names = Object.fromEntries(
    (produce.data?.produce ?? []).map((p) => [p.slug, pick(p.nameBn, p.nameEn)]),
  );
  const list = lots.data?.lots ?? [];
  const num = (n) =>
    Number(n ?? 0).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US', { maximumFractionDigits: 1 });

  async function withdraw(code) {
    await post(`/lots/${encodeURIComponent(code)}/withdraw`, {}).catch(() => {});
    lots.reload();
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wide text-turmeric-deep">
          {t('farmer.title')}
        </p>
        <h1 className="font-display text-4xl">{user?.name}</h1>
      </div>

      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t('earn.kg')} value={`${num(s.kg)} kg`} />
          <StatCard label={t('earn.total')} value={money(s.farmerBdt)} color="text-turmeric-deep" />
          <StatCard label={t('earn.unpaid')} value={money(s.unpaidBdt)} color="text-crate" />
          <StatCard label={t('earn.paid')} value={money(s.paidBdt)} color="text-soil" />
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
        <LotForm
          onCreated={() => {
            lots.reload();
            earnings.reload();
          }}
        />
        <ForecastPanel />
      </div>

      <section className="crate-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-jute-deep bg-jute px-5 py-3">
          <h2 className="font-display text-2xl">{t('lot.list')}</h2>
          <span className="chip border border-jute-deep text-soil-muted">
            {list.filter((l) => l.status === 'listed').length} {pick('টি চলমান', 'active')}
          </span>
        </div>
        {list.length === 0 && <p className="p-5 text-soil-muted">{t('lot.empty')}</p>}
        {list.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-xs text-soil-muted">
                <tr>
                  {[
                    pick('ফসল', 'Produce'),
                    pick('টিকবে', 'Shelf life'),
                    pick('এখনকার দর', 'Now'),
                    t('lot.floor'),
                    pick('বিক্রি', 'Sold'),
                    '',
                    '',
                  ].map((h, n) => (
                    <th key={n} className="px-5 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-jute-deep">
                {list.map((l) => (
                  <tr key={l.code}>
                    <td className="px-5 py-3">
                      <p className="font-semibold">{names[l.produceSlug] ?? l.produceSlug}</p>
                      <p className="font-mono text-xs text-soil-muted">
                        {l.code} · {t('triage.grade')} {l.grade}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      {l.status === 'listed' ? (
                        <ShelfBar hours={l.hoursToExpiry} />
                      ) : (
                        <span className="text-soil-muted">{t(`lotstatus.${l.status}`)}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">{money(l.priceBdt)}</td>
                    <td className="px-5 py-3 text-leaf-dark">{money(l.farmerFloorBdt)}</td>
                    <td className="px-5 py-3 font-mono">
                      {l.soldKg}/{l.quantityKg}
                    </td>
                    <td className="px-5 py-3">
                      {l.status === 'listed' && (
                        <span className="chip border border-leaf/40 bg-leaf/10 text-leaf-dark">
                          {t('lotstatus.listed')}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {l.status === 'listed' && (
                        <button
                          className="text-soil-muted hover:text-chili"
                          onClick={() => withdraw(l.code)}
                        >
                          {t('lot.withdraw')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
