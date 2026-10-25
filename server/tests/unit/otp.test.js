import { describe, expect, it } from 'vitest';
import { deriveOtp, newOtpSalt, verifyOtp } from '../../src/utils/otp.js';

const SECRET = 'test-secret-test-secret-test-secret-1234';

describe('delivery otp', () => {
  it('is the same every time for the same order', () => {
    const otp = deriveOtp(SECRET, 'ORD-ABCD2345', 'salt-1');
    expect(otp).toMatch(/^\d{6}$/);
    expect(deriveOtp(SECRET, 'ORD-ABCD2345', 'salt-1')).toBe(otp);
  });

  it('changes with the order, the salt and the secret', () => {
    const base = deriveOtp(SECRET, 'ORD-ABCD2345', 'salt-1');
    expect(deriveOtp(SECRET, 'ORD-ABCD2346', 'salt-1')).not.toBe(base);
    expect(deriveOtp(SECRET, 'ORD-ABCD2345', 'salt-2')).not.toBe(base);
    expect(deriveOtp('another-secret-another-secret-12345', 'ORD-ABCD2345', 'salt-1')).not.toBe(
      base,
    );
  });

  it('is always exactly six digits, including leading zeros', () => {
    for (let i = 0; i < 300; i++) {
      expect(deriveOtp(SECRET, 'ORD-ABCD2345', newOtpSalt())).toMatch(/^\d{6}$/);
    }
  });

  it('accepts the right code', () => {
    const otp = deriveOtp(SECRET, 'ORD-ABCD2345', 'salt-1');
    expect(verifyOtp(SECRET, 'ORD-ABCD2345', 'salt-1', otp)).toBe(true);
  });

  it('rejects a wrong code, or the right code for another order', () => {
    const otp = deriveOtp(SECRET, 'ORD-ABCD2345', 'salt-1');
    const wrong = otp === '000000' ? '000001' : '000000';
    expect(verifyOtp(SECRET, 'ORD-ABCD2345', 'salt-1', wrong)).toBe(false);
    expect(verifyOtp(SECRET, 'ORD-ABCD2346', 'salt-1', otp)).toBe(false);
  });

  it('rejects malformed attempts without throwing', () => {
    for (const attempt of [undefined, null, 123456, '', '12345', '1234567', 'abcdef', '12 456']) {
      expect(verifyOtp(SECRET, 'ORD-ABCD2345', 'salt-1', attempt)).toBe(false);
    }
  });

  it('makes salts that are unique and safe to store', () => {
    const salts = new Set(Array.from({ length: 500 }, () => newOtpSalt()));
    expect(salts.size).toBe(500);
    for (const salt of salts) expect(salt).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
