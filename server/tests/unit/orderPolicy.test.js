import { describe, expect, it } from 'vitest';
import { canTransition } from '../../src/constants/orders.js';
import { deliveryFeeBdt, orderTotals } from '../../src/services/orders/orderPolicy.js';

describe('order policy', () => {
  it('charges a flat delivery fee under the free-delivery line, and waives it at the line', () => {
    expect(deliveryFeeBdt(499)).toBe(40);
    expect(deliveryFeeBdt(500)).toBe(0);
  });

  it('totals the boxes at the prices the customer was shown', () => {
    const items = [
      { qty: 2, unitPriceBdt: 168 },
      { qty: 1, unitPriceBdt: 112 },
    ];
    expect(orderTotals(items)).toEqual({ subtotalBdt: 448, deliveryFeeBdt: 40, totalBdt: 488 });
    expect(orderTotals([{ qty: 3, unitPriceBdt: 168 }])).toEqual({
      subtotalBdt: 504,
      deliveryFeeBdt: 0,
      totalBdt: 504,
    });
  });

  it('only lets an order move forward, and be cancelled only before delivery starts', () => {
    expect(canTransition('placed', 'out_for_delivery')).toBe(true);
    expect(canTransition('placed', 'cancelled')).toBe(true);
    expect(canTransition('out_for_delivery', 'delivered')).toBe(true);
    expect(canTransition('out_for_delivery', 'cancelled')).toBe(false);
    expect(canTransition('delivered', 'cancelled')).toBe(false);
    expect(canTransition('cancelled', 'placed')).toBe(false);
  });
});
