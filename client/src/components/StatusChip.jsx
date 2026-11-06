// client/src/components/StatusChip.jsx
import { useI18n } from '../i18n/I18nContext.jsx';

const TONE = {
  placed: 'border-turmeric/50 bg-turmeric/10 text-turmeric-deep',
  out_for_delivery: 'border-crate/50 bg-crate/10 text-crate',
  delivered: 'border-leaf/40 bg-leaf/10 text-leaf-dark',
  cancelled: 'border-chili/50 bg-chili/10 text-chili',
};

export default function StatusChip({ status }) {
  const { t } = useI18n();
  return (
    <span className={`chip border ${TONE[status] ?? 'border-jute-deep'}`}>
      {t(`status.${status}`)}
    </span>
  );
}
