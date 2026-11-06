// client/src/components/RecipesPanel.jsx
import { useState } from 'react';
import { post } from '../api/client.js';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function RecipesPanel({ order }) {
  const { pick, lang } = useI18n();
  const [recipes, setRecipes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const slugs = [
    ...new Set((order.items ?? []).flatMap((i) => (i.lines ?? []).map((l) => l.produceSlug))),
  ].slice(0, 6);
  if (slugs.length === 0) return null;

  async function suggest() {
    setBusy(true);
    setError('');
    try {
      const res = await post('/recipes', { produceSlugs: slugs, language: lang });
      setRecipes(res.recipes ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="crate-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-turmeric-deep">
            {pick('রান্না বন্ধু', 'Cook with it')}
          </p>
          <h2 className="font-display text-2xl">
            {pick('যা আসছে, তা দিয়ে আজ রাতে', 'Tonight, with what’s coming')}
          </h2>
        </div>
        {!recipes && (
          <button className="btn-ghost" disabled={busy} onClick={suggest}>
            {busy ? '…' : pick('রেসিপি দেখুন', 'Suggest recipes')}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-chili">
          {error}
        </p>
      )}
      {recipes?.length === 0 && (
        <p className="mt-3 text-soil-muted">
          {pick('এবার কোনো রেসিপি পাওয়া যায়নি।', 'No recipes this time.')}
        </p>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {recipes?.map((r) => (
          <article key={r.title} className="rounded-lg border border-jute-deep p-4">
            <h3 className="font-display text-xl">{r.title}</h3>
            <p className="text-xs text-soil-muted">
              {r.timeMinutes} {pick('মিনিট', 'min')}
              {r.extras?.length ? ` · ${r.extras.join(', ')}` : ''}
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-4 text-sm text-soil-muted">
              {r.steps.map((s, n) => (
                <li key={n}>{s}</li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}
