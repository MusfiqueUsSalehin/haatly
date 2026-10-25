import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { Order } from '../../src/models/Order.js';
import { describeOrder } from '../../src/services/orders/describeOrder.js';
import { deriveOtp } from '../../src/utils/otp.js';

const SECRET = 'test-secret-test-secret-test-secret-1234';
const make = (status, overrides) =>
  new Order({
    code: 'ORD-ABCD2345',
    customer: new mongoose.Types.ObjectId(),
    status,
    otpSalt: 'salt-1',
    totalBdt: 376,
    ...overrides,
  });

describe('describeOrder', () => {
  it('shows the delivery code while delivery is still to come', () => {
    for (const status of ['placed', 'out_for_delivery']) {
      const view = describeOrder(make(status), { otpSecret: SECRET });
      expect(view.deliveryOtp).toBe(deriveOtp(SECRET, 'ORD-ABCD2345', 'salt-1'));
      expect(view.deliveryOtp).toMatch(/^\d{6}$/);
    }
  });

  it('hides the code once the order is delivered or cancelled', () => {
    for (const status of ['delivered', 'cancelled']) {
      expect(describeOrder(make(status), { otpSecret: SECRET }).deliveryOtp).toBeNull();
    }
  });

  it('leaves the code out entirely when no secret is given (the list view)', () => {
    expect(describeOrder(make('placed'))).not.toHaveProperty('deliveryOtp');
  });

  it('never exposes the salt or mongo internals', () => {
    const view = describeOrder(make('placed'), { otpSecret: SECRET });
    expect(view.otpSalt).toBeUndefined();
    expect(view._id).toBeUndefined();
    expect(view.code).toBe('ORD-ABCD2345');
  });

  it('refuses to guess a code when the salt was not loaded', () => {
    const order = make('placed', { otpSalt: undefined });
    expect(() => describeOrder(order, { otpSecret: SECRET })).toThrow(/otpSalt/);
  });
});
