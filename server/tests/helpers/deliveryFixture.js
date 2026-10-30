import { RiderProfile } from '../../src/models/RiderProfile.js';
import { checkout } from '../../src/services/orders/placeOrder.js';
import { createSandboxProvider } from '../../src/services/payments/sandbox.js';
import { createUser } from '../../src/services/userService.js';

const sandbox = createSandboxProvider({ webhookSecret: 'delivery-fixture-secret-delivery-12345' });

export const makeUser = (n, role, status = 'active') =>
  createUser({
    name: `Person ${n}`,
    email: `person${n}@example.com`,
    phone: '+8801712345678',
    password: 'a-strong-password',
    role,
    status,
  });

/** An on-duty bike rider in Dhaka covering the given zones. */
export const makeProfile = (user, zoneCodes, overrides = {}) =>
  RiderProfile.create({
    user: user._id,
    cityCode: 'dhaka',
    vehicle: 'bike',
    zoneCodes,
    onDuty: true,
    ...overrides,
  });

/** Place an order for `customer` from today's shelf. Family boxes weigh 3 kg each. */
export async function placeOrderFor(
  customer,
  today,
  { zoneCode = 'dhaka-mirpur', qty = 2, paymentMethod = 'cod' } = {},
) {
  const { order } = await checkout({
    customer: { _id: customer._id },
    provider: sandbox,
    body: {
      recipientName: 'Rahim Uddin',
      phone: '+8801712345678',
      zoneCode,
      address: { line: 'House 12, Road 3, Mirpur 10' },
      paymentMethod,
      items: [{ boxCode: `dhaka-family-${today}`, qty, seenUnitPriceBdt: 168 }],
    },
  });
  return order;
}
