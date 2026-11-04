// client/src/cart/cartReducer.test.js
import { describe, expect, it } from 'vitest';
import { cartReducer } from './CartContext.jsx';

const box = {
  code: 'dhaka-family-2026-11-05',
  tier: 'family',
  weightKg: 6,
  priceBdt: 300,
  unitsAvailable: 3,
};
const empty = { cityCode: null, items: [] };

describe('cartReducer', () => {
  it('adds, increments up to the stock and caps at units available', () => {
    let s = cartReducer(empty, { type: 'add', box, cityCode: 'dhaka' });
    for (let i = 0; i < 5; i++) s = cartReducer(s, { type: 'add', box, cityCode: 'dhaka' });
    expect(s.items).toHaveLength(1);
    expect(s.items[0].qty).toBe(3);
  });
  it('starts over when a box from another city is added', () => {
    const s = cartReducer(empty, { type: 'add', box, cityCode: 'dhaka' });
    const other = cartReducer(s, {
      type: 'add',
      box: { ...box, code: 'ctg-x-1' },
      cityCode: 'chattogram',
    });
    expect(other.items.map((i) => i.boxCode)).toEqual(['ctg-x-1']);
  });
  it('clamps quantity and reprices, dropping boxes no longer for sale', () => {
    let s = cartReducer(empty, { type: 'add', box, cityCode: 'dhaka' });
    s = cartReducer(s, { type: 'setQty', boxCode: box.code, qty: 99 });
    expect(s.items[0].qty).toBe(10);
    expect(
      cartReducer(s, { type: 'reprice', prices: { [box.code]: 250 } }).items[0].unitPriceBdt,
    ).toBe(250);
    expect(cartReducer(s, { type: 'reprice', prices: {} }).items).toEqual([]);
  });
});
