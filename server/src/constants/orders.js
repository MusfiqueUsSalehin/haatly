export const ORDER_STATUS = Object.freeze({
  PLACED: 'placed',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
});
export const ORDER_STATUSES = Object.freeze(Object.values(ORDER_STATUS));

// An order can only move forward, and only be cancelled before it leaves for delivery.
const TRANSITIONS = {
  placed: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
};
export const canTransition = (from, to) => TRANSITIONS[from]?.includes(to) ?? false;

export const PAYMENT_METHODS = Object.freeze(['cod', 'wallet']);
export const PAYMENT_STATUSES = Object.freeze(['unpaid', 'paid', 'refunded']);

export const ORDER_CODE_PATTERN = /^ORD-[A-HJ-NP-Z2-9]{8}$/;

export const MAX_ITEMS = 5; // different boxes in one order
export const MAX_QTY_PER_ITEM = 10;
export const DELIVERY_FEE_BDT = 40;
export const FREE_DELIVERY_FROM_BDT = 500;
