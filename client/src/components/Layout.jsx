// client/src/components/Layout.jsx
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCart } from '../cart/CartContext.jsx';
import { useCity } from '../city/CityContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { HOME_FOR_ROLE, ROUTES } from '../routes.js';

export default function Layout() {
  const { user, logout } = useAuth();
  const { t, lang, setLang, pick } = useI18n();
  const { count } = useCart();
  const { cities, city, setCode } = useCity();
  const navigate = useNavigate();
  const link = ({ isActive }) => (isActive ? 'font-semibold text-leaf' : 'hover:text-leaf');

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-soil/10 bg-white">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
          <Link
            to={user ? HOME_FOR_ROLE[user.role] : ROUTES.home}
            className="font-display text-2xl text-leaf"
          >
            {t('app.name')}
          </Link>
          <NavLink to={ROUTES.market} className={link}>
            {t('nav.market')}
          </NavLink>
          {user?.role === 'customer' && (
            <NavLink to={ROUTES.orders} className={link}>
              {t('nav.orders')}
            </NavLink>
          )}
          <NavLink to={ROUTES.impact} className={link}>
            {t('nav.impact')}
          </NavLink>

          <div className="ml-auto flex items-center gap-3">
            <select
              className="input w-auto"
              aria-label={t('city.label')}
              value={city?.code ?? ''}
              onChange={(e) => setCode(e.target.value)}
            >
              {cities.map((c) => (
                <option key={c.code} value={c.code}>
                  {pick(c.nameBn, c.nameEn)}
                </option>
              ))}
            </select>
            {(!user || user.role === 'customer') && (
              <NavLink to={ROUTES.cart} className={link}>
                {t('cart.title')} ({count})
              </NavLink>
            )}
            <button className="btn-ghost" onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}>
              {lang === 'bn' ? 'EN' : 'বাং'}
            </button>
            {user ? (
              <button
                className="btn-ghost"
                onClick={() => {
                  logout();
                  navigate(ROUTES.home);
                }}
              >
                {t('nav.logout')}
              </button>
            ) : (
              <>
                <Link to={ROUTES.login} className="btn-ghost">
                  {t('nav.login')}
                </Link>
                <Link to={ROUTES.register} className="btn-primary">
                  {t('nav.register')}
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
