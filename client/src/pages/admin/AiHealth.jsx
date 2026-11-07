// client/src/pages/admin/AiHealth.jsx
import { useApi } from '../../api/useApi.js';
import StatCard from '../../components/StatCard.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';

export default function AiHealth() {
  const { pick, lang } = useI18n();
  const { data, error, loading } = useApi('/admin/ai/health');
  if (loading) return <p>…</p>;
  if (error)
    return (
      <p role="alert" className="text-chili">
        {error.message}
      </p>
    );

  const num = (n) => Number(n ?? 0).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US');
  const names = {
    triage: pick('ছবি গ্রেডিং', 'Photo grading'),
    recipes: pick('রেসিপি', 'Recipes'),
    impact_narrative: pick('প্রভাবের সারাংশ', 'Impact summary'),
  };
  const on = data.provider === 'anthropic';

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={pick('এআই', 'AI')}
          value={on ? pick('চালু', 'On') : pick('বন্ধ', 'Off')}
          color={on ? 'text-leaf-dark' : 'text-turmeric-deep'}
          hint={
            on
              ? data.model
              : pick('শুধু নিয়ম চলছে (AI_PROVIDER=none)', 'Rules only (AI_PROVIDER=none)')
          }
        />
        <StatCard
          label={pick('গত ২৪ ঘণ্টায় মডেল কল', 'Model calls, 24h')}
          value={`${num(data.budget.used)} / ${num(data.budget.limit)}`}
          color="text-crate"
        />
        <StatCard
          label={pick('ফিচার', 'Features used')}
          value={num(data.features.length)}
          color="text-soil"
        />
      </div>

      <div className="crate-card overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="text-left text-xs text-soil-muted">
            <tr>
              {[
                pick('ফিচার', 'Feature'),
                pick('কল', 'Calls'),
                pick('এআই উত্তর', 'AI answered'),
                pick('নিয়মের উত্তর', 'Rules answered'),
                pick('কারণ', 'Why rules'),
                pick('গড় সময়', 'Avg latency'),
                pick('টোকেন', 'Tokens in/out'),
              ].map((h) => (
                <th key={h} className="px-4 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-jute-deep">
            {data.features.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-soil-muted">
                  {pick('গত ২৪ ঘণ্টায় কোনো কল নেই', 'No calls in the last 24 hours')}
                </td>
              </tr>
            )}
            {data.features.map((f) => (
              <tr key={f.feature}>
                <td className="px-4 py-2 font-semibold">{names[f.feature] ?? f.feature}</td>
                <td className="px-4 py-2 font-mono">{f.calls}</td>
                <td className="px-4 py-2 font-mono text-leaf-dark">{f.modelAnswers}</td>
                <td className="px-4 py-2 font-mono">{f.ruleAnswers}</td>
                <td className="px-4 py-2 text-xs text-soil-muted">
                  {Object.entries(f.fallbackReasons)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(', ') || '–'}
                </td>
                <td className="px-4 py-2 font-mono text-soil-muted">
                  {f.avgLatencyMs == null ? '–' : `${f.avgLatencyMs} ms`}
                </td>
                <td className="px-4 py-2 font-mono text-soil-muted">
                  {f.inputTokens}/{f.outputTokens}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-soil-muted">
        {pick(
          'নিয়মের উত্তর মানে এআই বন্ধ ছিল, ব্যর্থ হয়েছে বা দৈনিক সীমা শেষ। ফিচার তখনও ঠিকঠাক কাজ করে।',
          'A rules answer means the AI was off, failed or hit the daily cap; the feature still works.',
        )}
      </p>
    </div>
  );
}
