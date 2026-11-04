// client/src/pages/Home.jsx
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext.jsx';
import { ROUTES } from '../routes.js';

export default function Home() {
  const { t } = useI18n();
  return (
    <section className="py-16 text-center">
      <h1 className="font-display text-5xl text-leaf">{t('app.tagline')}</h1>
      <Link to={ROUTES.market} className="btn-primary mt-8">
        {t('nav.market')}
      </Link>
    </section>
  );
}
