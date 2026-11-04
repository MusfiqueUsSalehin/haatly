// client/src/App.jsx
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import RequireRole from './auth/RequireRole.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Placeholder from './pages/Placeholder.jsx';
import { useI18n } from './i18n/I18nContext.jsx';
import { ROUTES } from './routes.js';

const stub = (name) => <Placeholder name={name} />;

export default function App() {
  const { t } = useI18n();
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path={ROUTES.home} element={<Home />} />
        <Route path={ROUTES.login} element={<Login />} />
        <Route path={ROUTES.register} element={<Register />} />

        {/* Replaced by real pages in steps 18-20 */}
        <Route path={ROUTES.market} element={stub('Market')} />
        <Route path={ROUTES.box} element={stub('Box')} />
        <Route path={ROUTES.cart} element={stub('Cart')} />
        <Route path={ROUTES.impact} element={stub('Impact')} />
        <Route
          path={ROUTES.checkout}
          element={<RequireRole roles={['customer']}>{stub('Checkout')}</RequireRole>}
        />
        <Route
          path={ROUTES.orders}
          element={<RequireRole roles={['customer']}>{stub('Orders')}</RequireRole>}
        />
        <Route
          path={ROUTES.order}
          element={<RequireRole roles={['customer']}>{stub('Order')}</RequireRole>}
        />
        <Route
          path={ROUTES.farmer}
          element={<RequireRole roles={['farmer']}>{stub('Farmer')}</RequireRole>}
        />
        <Route
          path={ROUTES.rider}
          element={<RequireRole roles={['rider']}>{stub('Rider')}</RequireRole>}
        />
        <Route
          path={ROUTES.admin}
          element={<RequireRole roles={['admin']}>{stub('Admin')}</RequireRole>}
        />
        <Route
          path={ROUTES.hub}
          element={<RequireRole roles={['hub_manager']}>{stub('Hub')}</RequireRole>}
        />
        <Route path="*" element={<p className="py-16 text-center">{t('notfound')}</p>} />
      </Route>
    </Routes>
  );
}
