// client/src/App.jsx
import { Route, Routes } from 'react-router-dom';
import RequireRole from './auth/RequireRole.jsx';
import Layout from './components/Layout.jsx';
import { useI18n } from './i18n/I18nContext.jsx';
import Admin from './pages/Admin.jsx';
import BoxDetail from './pages/BoxDetail.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import Farmer from './pages/Farmer.jsx';
import Home from './pages/Home.jsx';
import Hub from './pages/Hub.jsx';
import Impact from './pages/Impact.jsx';
import Login from './pages/Login.jsx';
import Market from './pages/Market.jsx';
import OrderTrack from './pages/OrderTrack.jsx';
import Orders from './pages/Orders.jsx';
import Register from './pages/Register.jsx';
import Rider from './pages/Rider.jsx';
import SandboxPay from './pages/SandboxPay.jsx';
import { ROUTES } from './routes.js';

const only = (role, page) => <RequireRole roles={[role]}>{page}</RequireRole>;

export default function App() {
  const { t } = useI18n();
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public */}
        <Route path={ROUTES.home} element={<Home />} />
        <Route path={ROUTES.login} element={<Login />} />
        <Route path={ROUTES.register} element={<Register />} />
        <Route path={ROUTES.market} element={<Market />} />
        <Route path={ROUTES.box} element={<BoxDetail />} />
        <Route path={ROUTES.cart} element={<Cart />} />
        <Route path={ROUTES.impact} element={<Impact />} />

        {/* Customer */}
        <Route path={ROUTES.checkout} element={only('customer', <Checkout />)} />
        <Route path={ROUTES.orders} element={only('customer', <Orders />)} />
        <Route path={ROUTES.order} element={only('customer', <OrderTrack />)} />
        <Route path={ROUTES.sandboxPay} element={only('customer', <SandboxPay />)} />

        {/* Staff */}
        <Route path={ROUTES.farmer} element={only('farmer', <Farmer />)} />
        <Route path={ROUTES.rider} element={only('rider', <Rider />)} />
        <Route path={ROUTES.admin} element={only('admin', <Admin />)} />
        <Route path={ROUTES.hub} element={only('hub_manager', <Hub />)} />

        <Route path="*" element={<p className="py-16 text-center">{t('notfound')}</p>} />
      </Route>
    </Routes>
  );
}
