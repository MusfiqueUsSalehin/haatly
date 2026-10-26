import { ORDER_STATUS } from '../../constants/orders.js';
import { deriveOtp } from '../../utils/otp.js';

const SHOWS_OTP = new Set([ORDER_STATUS.PLACED, ORDER_STATUS.OUT_FOR_DELIVERY]);

/**
 * An order as its customer sees it. Pass `otpSecret` (and load the order with +otpSalt)
 * to include the delivery code: it is shown only while delivery is still to come, and
 * is `null` once the order is delivered or cancelled.
 */
export function describeOrder(order, { otpSecret } = {}) {
  const view = order.toJSON();
  if (otpSecret) {
    if (!order.otpSalt) throw new Error('load the order with .select("+otpSalt") to show its code');
    view.deliveryOtp = SHOWS_OTP.has(order.status)
      ? deriveOtp(otpSecret, order.code, order.otpSalt)
      : null;
  }
  return view;
}
