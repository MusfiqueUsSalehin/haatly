import { createSandboxProvider } from './sandbox.js';

/** The configured wallet provider, or null when only cash on delivery is available. */
export function createPaymentProvider(env) {
  if (env.PAYMENT_PROVIDER === 'sandbox') {
    return createSandboxProvider({ webhookSecret: env.PAYMENT_WEBHOOK_SECRET });
  }
  return null;
}
