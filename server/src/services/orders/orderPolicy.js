import { DELIVERY_FEE_BDT, FREE_DELIVERY_FROM_BDT } from '../../constants/orders.js';

export const deliveryFeeBdt = (subtotalBdt) =>
  subtotalBdt >= FREE_DELIVERY_FROM_BDT ? 0 : DELIVERY_FEE_BDT;

/** The money for an order. Customers pay each box at the price they were shown. */
export function orderTotals(items) {
  const subtotalBdt = items.reduce((sum, item) => sum + item.qty * item.unitPriceBdt, 0);
  const fee = deliveryFeeBdt(subtotalBdt);
  return { subtotalBdt, deliveryFeeBdt: fee, totalBdt: subtotalBdt + fee };
}
