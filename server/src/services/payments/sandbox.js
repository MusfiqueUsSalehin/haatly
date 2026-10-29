import { randomCode } from '../../utils/ids.js';
import { signPayload } from '../../utils/signature.js';

function assertAmount(amountBdt) {
  if (!Number.isInteger(amountBdt) || amountBdt < 1) {
    throw new RangeError('amountBdt must be a whole number of taka, at least 1');
  }
}

/**
 * A pretend wallet gateway for development and tests. Every payment provider offers:
 *   createCharge({ orderCode, amountBdt }) -> { providerRef, payUrl }
 *   refund({ providerRef, amountBdt })     -> { refundRef }
 * Real gateways report results by sending a signed webhook. The sandbox can build the same
 * kind of signed event (buildEvent) so the whole flow can be tried without a real gateway.
 */
export function createSandboxProvider({ webhookSecret, clock = () => new Date() }) {
  return {
    name: 'sandbox',

    async createCharge({ orderCode, amountBdt }) {
      assertAmount(amountBdt);
      const providerRef = randomCode('SBX', 12);
      return { providerRef, payUrl: `/sandbox/pay/${providerRef}?order=${orderCode}` };
    },

    async refund({ providerRef, amountBdt }) {
      assertAmount(amountBdt);
      if (!providerRef) throw new RangeError('providerRef is required');
      return { refundRef: randomCode('RFN', 12) };
    },

    /** The signed event a gateway would send once the customer has paid (or failed to). */
    buildEvent({ providerRef, orderCode, amountBdt, outcome }) {
      if (!['succeeded', 'failed'].includes(outcome)) {
        throw new RangeError('outcome must be "succeeded" or "failed"');
      }
      const now = clock();
      const rawBody = JSON.stringify({
        id: randomCode('EVT', 12),
        type: `payment.${outcome}`,
        providerRef,
        orderCode,
        amountBdt,
        createdAt: now.toISOString(),
      });
      const timestamp = String(Math.floor(now.getTime() / 1000));
      return {
        rawBody,
        headers: {
          'x-haatly-timestamp': timestamp,
          'x-haatly-signature': signPayload(webhookSecret, timestamp, rawBody),
        },
      };
    },
  };
}
