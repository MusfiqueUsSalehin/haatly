import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCTION_PARAMS,
  hashPassword,
  useHashParams,
  verifyPassword,
} from '../../src/utils/password.js';

describe('password hashing', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('keeps the strong production settings', () => {
    expect(PRODUCTION_PARAMS).toEqual({ N: 2 ** 15, r: 8, p: 3 });
    expect(Object.isFrozen(PRODUCTION_PARAMS)).toBe(true);
  });

  it('refuses to weaken hashing outside tests', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => useHashParams({ N: 2, r: 1, p: 1 })).toThrow(/tests only/);
  });

  it('verifies the correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password!!', hash)).toBe(false);
  });

  it('never stores the plain password and salts every hash', async () => {
    const a = await hashPassword('same-password-123');
    const b = await hashPassword('same-password-123');
    expect(a).not.toContain('same-password-123');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$')).toBe(true);
  });

  it('returns false for malformed or missing hashes instead of throwing', async () => {
    expect(await verifyPassword('x', undefined)).toBe(false);
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$1$2$3$4$5')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$abc$8$3$c2FsdA$aGFzaA')).toBe(false);
  });

  it('handles unicode and long passwords', async () => {
    const password = 'পাসওয়ার্ড-🔒-'.repeat(8);
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(password + 'x', hash)).toBe(false);
  });
});
