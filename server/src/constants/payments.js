export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
});
export const PAYMENT_STATUS_LIST = Object.freeze(Object.values(PAYMENT_STATUS));

// A payment only ever moves forward: money is never "un-failed" or "un-refunded".
const TRANSITIONS = {
  pending: ['succeeded', 'failed', 'cancelled'],
  succeeded: ['refunded'],
  failed: [],
  cancelled: [],
  refunded: [],
};
export const canMovePayment = (from, to) => TRANSITIONS[from]?.includes(to) ?? false;

export const CHARGE_METHODS = Object.freeze(['cod', 'wallet']);
export const PAYMENT_CODE_PATTERN = /^PAY-[A-HJ-NP-Z2-9]{8}$/;
