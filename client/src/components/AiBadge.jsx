// client/src/components/AiBadge.jsx
import { useI18n } from '../i18n/I18nContext.jsx';

/** Tells the user whether the AI or the built-in rules produced what they are looking at. */
export default function AiBadge({ source }) {
  const { pick } = useI18n();
  if (!source) return null;
  return source === 'model' ? (
    <span className="chip border border-turmeric/50 bg-turmeric/10 text-turmeric-deep">
      ✦ {pick('এআই', 'AI')}
    </span>
  ) : (
    <span className="chip border border-jute-deep text-soil-muted">
      {pick('নিয়ম-ভিত্তিক', 'Rules')}
    </span>
  );
}
