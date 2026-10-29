import { describe, expect, it } from 'vitest';
import { signPayload, verifySignature } from '../../src/utils/signature.js';

const SECRET = 'webhook-secret-webhook-secret-12345678';
const NOW = new Date('2026-10-20T06:00:00Z');
const STAMP = String(Math.floor(NOW.getTime() / 1000));
const BODY = '{"id":"EVT-1","type":"payment.succeeded","amountBdt":376}';
const check = (overrides = {}) =>
  verifySignature({
    secret: SECRET,
    timestamp: STAMP,
    rawBody: BODY,
    signature: signPayload(SECRET, STAMP, BODY),
    now: NOW,
    ...overrides,
  });

describe('webhook signatures', () => {
  it('accepts a correctly signed, recent request', () => {
    expect(check()).toBe(true);
    expect(signPayload(SECRET, STAMP, BODY)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a changed body or the wrong secret', () => {
    expect(check({ rawBody: BODY.replace('376', '1') })).toBe(false);
    expect(check({ secret: 'another-secret-another-secret-12345678' })).toBe(false);
  });

  it('rejects a signature made for a different timestamp', () => {
    const other = String(Number(STAMP) + 1);
    expect(check({ signature: signPayload(SECRET, other, BODY) })).toBe(false);
  });

  it('allows up to five minutes of clock difference, no more', () => {
    const at = (seconds) => new Date(NOW.getTime() + seconds * 1000);
    expect(check({ now: at(300) })).toBe(true);
    expect(check({ now: at(301) })).toBe(false); // too old: replayed
    expect(check({ now: at(-300) })).toBe(true);
    expect(check({ now: at(-301) })).toBe(false); // too far in the future
  });

  it('rejects malformed input without throwing', () => {
    for (const signature of [undefined, null, '', 'zz', 'ABC123', 'a'.repeat(63), 'g'.repeat(64)]) {
      expect(check({ signature })).toBe(false);
    }
    for (const timestamp of [undefined, '', 'abc', '-5', '12.5', '1'.repeat(13)]) {
      expect(check({ timestamp })).toBe(false);
    }
  });
});
