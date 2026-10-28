import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';
import { createPaymentProvider } from '../../src/services/payments/index.js';
import { createSandboxProvider } from '../../src/services/payments/sandbox.js';
import { verifySignature } from '../../src/utils/signature.js';

const SECRET = 'webhook-secret-webhook-secret-12345678';
const NOW = new Date('2026-10-20T06:00:00Z');
const provider = () => createSandboxProvider({ webhookSecret: SECRET, clock: () => NOW });
const verify = ({ rawBody, headers }, secret = SECRET) =>
  verifySignature({
    secret,
    timestamp: headers['x-haatly-timestamp'],
    rawBody,
    signature: headers['x-haatly-signature'],
    now: NOW,
  });

describe('sandbox provider', () => {
  it('creates a charge with a unique reference and a pay link', async () => {
    const a = await provider().createCharge({ orderCode: 'ORD-ABCD2345', amountBdt: 376 });
    const b = await provider().createCharge({ orderCode: 'ORD-ABCD2345', amountBdt: 376 });
    expect(a.providerRef).toMatch(/^SBX-[A-HJ-NP-Z2-9]{12}$/);
    expect(a.providerRef).not.toBe(b.providerRef);
    expect(a.payUrl).toContain(a.providerRef);
    expect(a.payUrl).toContain('ORD-ABCD2345');
  });

  it('rejects amounts that are not whole positive taka', async () => {
    for (const amountBdt of [0, -1, 12.5, '376', undefined]) {
      await expect(
        provider().createCharge({ orderCode: 'ORD-ABCD2345', amountBdt }),
      ).rejects.toThrow(RangeError);
    }
  });

  it('refunds with a reference, and needs a charge to refund', async () => {
    const out = await provider().refund({ providerRef: 'SBX-ABCDEFGHJKLM', amountBdt: 376 });
    expect(out.refundRef).toMatch(/^RFN-[A-HJ-NP-Z2-9]{12}$/);
    await expect(provider().refund({ amountBdt: 376 })).rejects.toThrow(RangeError);
    await expect(
      provider().refund({ providerRef: 'SBX-ABCDEFGHJKLM', amountBdt: 0 }),
    ).rejects.toThrow(RangeError);
  });

  it('builds a signed event the way a real gateway would', () => {
    const event = provider().buildEvent({
      providerRef: 'SBX-ABCDEFGHJKLM',
      orderCode: 'ORD-ABCD2345',
      amountBdt: 376,
      outcome: 'succeeded',
    });
    expect(JSON.parse(event.rawBody)).toMatchObject({
      type: 'payment.succeeded',
      providerRef: 'SBX-ABCDEFGHJKLM',
      orderCode: 'ORD-ABCD2345',
      amountBdt: 376,
      createdAt: '2026-10-20T06:00:00.000Z',
    });
    expect(JSON.parse(event.rawBody).id).toMatch(/^EVT-[A-HJ-NP-Z2-9]{12}$/);
    expect(verify(event)).toBe(true);
  });

  it('signs failure events too, and gives every event its own id', () => {
    const make = () =>
      provider().buildEvent({
        providerRef: 'SBX-ABCDEFGHJKLM',
        orderCode: 'ORD-ABCD2345',
        amountBdt: 376,
        outcome: 'failed',
      });
    expect(JSON.parse(make().rawBody).type).toBe('payment.failed');
    expect(JSON.parse(make().rawBody).id).not.toBe(JSON.parse(make().rawBody).id);
  });

  it('produces events that fail verification with another secret or a changed body', () => {
    const event = provider().buildEvent({
      providerRef: 'SBX-ABCDEFGHJKLM',
      orderCode: 'ORD-ABCD2345',
      amountBdt: 376,
      outcome: 'succeeded',
    });
    expect(verify(event, 'another-secret-another-secret-12345678')).toBe(false);
    expect(verify({ ...event, rawBody: event.rawBody.replace('376', '1') })).toBe(false);
  });

  it('refuses an unknown outcome', () => {
    expect(() =>
      provider().buildEvent({ providerRef: 'x', orderCode: 'y', amountBdt: 1, outcome: 'maybe' }),
    ).toThrow(RangeError);
  });
});

describe('createPaymentProvider', () => {
  const base = {
    MONGODB_URI: 'mongodb://127.0.0.1:27017/haatly',
    JWT_SECRET: 'a-long-random-secret-for-tests-0123456789',
  };

  it('is off by default, leaving cash on delivery only', () => {
    expect(createPaymentProvider(parseEnv(base))).toBeNull();
  });

  it('builds the sandbox from the settings, signing with the webhook secret', () => {
    const env = parseEnv({ ...base, PAYMENT_PROVIDER: 'sandbox' });
    const sandbox = createPaymentProvider(env);
    expect(sandbox.name).toBe('sandbox');

    const event = sandbox.buildEvent({
      providerRef: 'SBX-ABCDEFGHJKLM',
      orderCode: 'ORD-ABCD2345',
      amountBdt: 100,
      outcome: 'succeeded',
    });
    const ok = verifySignature({
      secret: env.PAYMENT_WEBHOOK_SECRET,
      timestamp: event.headers['x-haatly-timestamp'],
      rawBody: event.rawBody,
      signature: event.headers['x-haatly-signature'],
    });
    expect(ok).toBe(true);
  });
});
