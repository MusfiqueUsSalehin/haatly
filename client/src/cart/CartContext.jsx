// client/src/cart/CartContext.jsx
import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';

export const MAX_QTY = 10; // matches the server limit per box
const KEY = 'haatly.cart';
const EMPTY = { cityCode: null, items: [] };

/** Pure, so it can be tested. Boxes belong to one city: adding from another city starts over. */
export function cartReducer(state, action) {
  switch (action.type) {
    case 'add': {
      const { box, cityCode } = action;
      const base = state.cityCode === cityCode ? state.items : [];
      const cap = Math.min(MAX_QTY, box.unitsAvailable);
      const found = base.find((i) => i.boxCode === box.code);
      const items = found
        ? base.map((i) =>
            i.boxCode === box.code
              ? { ...i, qty: Math.min(i.qty + 1, cap), unitPriceBdt: box.priceBdt }
              : i,
          )
        : [
            ...base,
            {
              boxCode: box.code,
              tier: box.tier,
              weightKg: box.weightKg,
              unitPriceBdt: box.priceBdt,
              qty: 1,
            },
          ];
      return { cityCode, items };
    }
    case 'setQty':
      return {
        ...state,
        items: state.items.map((i) =>
          i.boxCode === action.boxCode
            ? { ...i, qty: Math.max(1, Math.min(MAX_QTY, action.qty)) }
            : i,
        ),
      };
    case 'remove':
      return { ...state, items: state.items.filter((i) => i.boxCode !== action.boxCode) };
    case 'reprice': // prices: { boxCode: priceBdt | null }; null or missing = no longer for sale
      return {
        ...state,
        items: state.items
          .filter((i) => action.prices[i.boxCode] != null)
          .map((i) => ({ ...i, unitPriceBdt: action.prices[i.boxCode] })),
      };
    case 'clear':
      return EMPTY;
    default:
      return state;
  }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(saved?.items) ? saved : EMPTY;
  } catch {
    return EMPTY;
  }
}

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, undefined, load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked: the cart just won't survive a reload */
    }
  }, [state]);

  const value = useMemo(
    () => ({
      ...state,
      dispatch,
      count: state.items.reduce((n, i) => n + i.qty, 0),
      subtotalBdt: state.items.reduce((n, i) => n + i.qty * i.unitPriceBdt, 0),
    }),
    [state],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
};
