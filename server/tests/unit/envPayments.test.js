import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';

const valid = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/haatly',
  JWT_SECRET: 'a-long-random-secret-for-tests-0123456789',
};

describe('parseEnv: payment settings', () => {
  it('defaults to cash on delivery only, with a 15 minute payment window', () => {
    const env = parseEnv(valid);
    expect(env.PAYMENT_PROVIDER).toBe('none');
    expect(env.PAYMENT_WINDOW_MINUTES).toBe(15);
  });

  it('derives a stable webhook secret from JWT_SECRET when none is given', () => {
    const a = parseEnv(valid).PAYMENT_WEBHOOK_SECRET;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(valid.JWT_SECRET);
    expect(parseEnv(valid).PAYMENT_WEBHOOK_SECRET).toBe(a);

    const other = parseEnv({ ...valid, JWT_SECRET: 'another-long-random-secret-0123456789ab' });
    expect(other.PAYMENT_WEBHOOK_SECRET).not.toBe(a);
  });

  it('uses an explicit webhook secret and rejects a short one', () => {
    const secret = 'x'.repeat(40);
    expect(parseEnv({ ...valid, PAYMENT_WEBHOOK_SECRET: secret }).PAYMENT_WEBHOOK_SECRET).toBe(
      secret,
    );
    expect(() => parseEnv({ ...valid, PAYMENT_WEBHOOK_SECRET: 'too-short' })).toThrow(
      /PAYMENT_WEBHOOK_SECRET/,
    );
  });

  it('treats a blank webhook secret as missing', () => {
    const env = parseEnv({ ...valid, PAYMENT_WEBHOOK_SECRET: '' });
    expect(env.PAYMENT_WEBHOOK_SECRET).toMatch(/^[0-9a-f]{64}$/);
  });

  it('allows the sandbox provider outside production only', () => {
    expect(parseEnv({ ...valid, PAYMENT_PROVIDER: 'sandbox' }).PAYMENT_PROVIDER).toBe('sandbox');
    const production = { ...valid, NODE_ENV: 'production' };
    expect(() => parseEnv({ ...production, PAYMENT_PROVIDER: 'sandbox' })).toThrow(/sandbox/);
    expect(parseEnv({ ...production, PAYMENT_PROVIDER: 'none' }).PAYMENT_PROVIDER).toBe('none');
  });

  it('rejects an unknown provider and keeps the window between 5 and 120 minutes', () => {
    expect(() => parseEnv({ ...valid, PAYMENT_PROVIDER: 'stripe' })).toThrow(/PAYMENT_PROVIDER/);
    expect(() => parseEnv({ ...valid, PAYMENT_WINDOW_MINUTES: '4' })).toThrow(
      /PAYMENT_WINDOW_MINUTES/,
    );
    expect(() => parseEnv({ ...valid, PAYMENT_WINDOW_MINUTES: '121' })).toThrow(
      /PAYMENT_WINDOW_MINUTES/,
    );
    expect(parseEnv({ ...valid, PAYMENT_WINDOW_MINUTES: '30' }).PAYMENT_WINDOW_MINUTES).toBe(30);
  });
});
