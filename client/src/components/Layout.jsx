// client/src/components/Layout.jsx  (replace)
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCart } from '../cart/CartContext.jsx';
import { useCity } from '../city/CityContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { HOME_FOR_ROLE, ROUTES } from '../routes.js';
import { useTheme } from '../theme/ThemeContext.jsx';
import Icon from './Icon.jsx';

function Crate({ className = '' }) {
  // The mark is a produce crate: the object the whole network moves.
  return (
    <svg viewBox="0 0 32 26" className={className} aria-hidden="true">
      <path d="M2 7h28l-3 17H5L2 7Z" fill="#1D6FA3" />
      <path d="M2 7h28l-1.2 3.4H3.2L2 7Z" fill="#155A87" />
      <path d="M10 10.5v11M16 10.5v11M22 10.5v11" stroke="#E8DFC8" strokeWidth="1.3" />
      <path d="M11 6.6c1.4-4 6-5.4 9-3.2-2.6.3-4.6 1.6-5.7 3.2h-3.3Z" fill="#4C8159" />
    </svg>
  );
}

function FooterLinks({ title, items }) {
  return (
    <div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <ul className="space-y-1.5 text-soil-muted">
        {items.map(([to, label]) => (
          <li key={to}>
            <Link to={to} className="hover:text-leaf-dark">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const { cities } = useCity();
  const { t, pick, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const isShopper = !user || user.role === 'customer';
  const tabs = [
    { to: ROUTES.market, icon: 'leaf', label: t('nav.market') },
    ...(isShopper
      ? [
          { to: ROUTES.cart, icon: 'cart', label: t('cart.title') },
          { to: ROUTES.orders, icon: 'truck', label: t('nav.orders') },
        ]
      : [{ to: HOME_FOR_ROLE[user.role], icon: 'truck', label: t(`role.${user.role}`) }]),
    { to: ROUTES.impact, icon: 'chart', label: t('nav.impact') },
  ];
  const pill = ({ isActive }) =>
    `rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-leaf/10 text-leaf-dark' : 'text-soil-muted hover:text-leaf-dark'}`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-jute-deep bg-jute-light/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link
            to={user ? HOME_FOR_ROLE[user.role] : ROUTES.home}
            className="flex shrink-0 items-center gap-2.5"
          >
            <Crate className="h-7 w-8" />
            <span className="font-display text-xl leading-none text-leaf-dark">
              {t('app.name')}
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {tabs.map((tab) =>
              tab.to === ROUTES.cart ? null : (
                <NavLink key={tab.to} to={tab.to} className={pill}>
                  {tab.label}
                </NavLink>
              ),
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
              className="rounded-lg border border-jute-deep px-2.5 py-1.5 text-sm font-semibold text-soil-muted hover:border-leaf hover:text-leaf-dark"
            >
              {lang === 'bn' ? 'EN' : 'বাং'}
            </button>
            <button
              onClick={toggle}
              className="rounded-lg border border-jute-deep p-2 text-turmeric hover:border-turmeric"
              aria-label={
                theme === 'dark'
                  ? pick('দিনের আলোয় দেখুন', 'Switch to the daylight theme')
                  : pick('রাতের মোডে দেখুন', 'Switch to the dark theme')
              }
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>

            {isShopper && (
              <Link
                to={ROUTES.cart}
                className="relative flex items-center gap-2 rounded-lg border border-jute-deep px-3 py-2 text-sm font-semibold hover:border-leaf"
              >
                <Icon name="cart" size={16} />
                <span className="hidden sm:inline">{t('cart.title')}</span>
                {count > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-turmeric text-xs font-bold text-jute-light">
                    {count}
                  </span>
                )}
              </Link>
            )}

            {user ? (
              <div className="hidden items-center gap-2 sm:flex">
                <Link to={HOME_FOR_ROLE[user.role]} className="btn-primary text-sm">
                  {user.name.split(' ')[0]}
                </Link>
                <button
                  onClick={() => {
                    logout();
                    navigate(ROUTES.home);
                  }}
                  className="text-sm text-soil-muted hover:text-chili"
                >
                  {t('nav.logout')}
                </button>
              </div>
            ) : (
              <Link to={ROUTES.login} className="btn-primary hidden text-sm sm:inline-flex">
                {t('nav.login')}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:pb-8">
        <Outlet />
      </main>

      <footer className="mt-10 border-t border-jute-deep bg-jute">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm md:grid-cols-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Crate className="h-5 w-6" />
              <span className="font-display text-lg text-leaf-dark">{t('app.name')}</span>
            </div>
            <p className="text-soil-muted">{t('app.tagline')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {cities.map((c) => (
                <span key={c.code} className="chip border border-jute-deep text-soil-muted">
                  {pick(c.nameBn, c.nameEn)}
                </span>
              ))}
            </div>
          </div>
          <FooterLinks
            title={t('nav.market')}
            items={[
              [ROUTES.market, t('nav.market')],
              [ROUTES.cart, t('cart.title')],
              [ROUTES.orders, t('nav.orders')],
            ]}
          />
          <FooterLinks
            title={pick('কৃষক', 'Growers')}
            items={[
              [ROUTES.register, t('lot.new')],
              [ROUTES.farmer, t('farmer.title')],
            ]}
          />
          <FooterLinks
            title={pick('প্রতিষ্ঠান', 'About')}
            items={[
              [ROUTES.impact, t('nav.impact')],
              [ROUTES.login, t('nav.login')],
            ]}
          />
        </div>
      </footer>

      {/* Phone: a bottom tab bar, like the design. */}
      <nav
        aria-label="main"
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-jute-deep bg-jute-light/95 backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${isActive ? 'text-leaf-dark' : 'text-soil-muted'}`
            }
          >
            <Icon name={tab.icon} size={20} />
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
