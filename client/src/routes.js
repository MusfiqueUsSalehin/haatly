// client/src/routes.js
export const ROUTES = Object.freeze({
  home: '/',
  market: '/market',
  box: '/boxes/:code',
  cart: '/cart',
  checkout: '/checkout',
  orders: '/orders',
  order: '/orders/:code', // the real tracking route
  impact: '/impact',
  login: '/login',
  register: '/register',
  farmer: '/farmer',
  rider: '/rider',
  admin: '/admin',
  hub: '/hub',
  sandboxPay: '/sandbox/pay/:ref', // dev-only wallet page; server payUrl points here
});

/** Build a link: path('order', { code: 'ORD-1' }) -> /orders/ORD-1 */
export function path(name, params = {}) {
  const pattern = ROUTES[name];
  if (!pattern) throw new Error(`Unknown route "${name}"`);
  return pattern.replace(/:(\w+)/g, (_, key) => {
    if (params[key] === undefined) throw new Error(`Route "${name}" needs "${key}"`);
    return encodeURIComponent(params[key]);
  });
}

/** Where each role lands after sign-in. */
export const HOME_FOR_ROLE = Object.freeze({
  customer: ROUTES.market,
  farmer: ROUTES.farmer,
  rider: ROUTES.rider,
  hub_manager: ROUTES.hub,
  admin: ROUTES.admin,
});
