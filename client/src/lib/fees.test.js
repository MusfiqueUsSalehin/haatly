// client/src/lib/fees.test.js
import { expect, it } from 'vitest';
import { deliveryFee, FREE_DELIVERY_FROM_BDT } from './fees.js';

it('charges below the free-delivery line and nothing at or above it', () => {
  expect(deliveryFee(FREE_DELIVERY_FROM_BDT - 1)).toBeGreaterThan(0);
  expect(deliveryFee(FREE_DELIVERY_FROM_BDT)).toBe(0);
});
