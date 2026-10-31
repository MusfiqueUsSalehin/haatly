import { describe, expect, it, vi } from 'vitest';
import {
  MAX_TIMER_MS,
  SocketAuthError,
  authenticateHandshake,
  msUntil,
} from '../../src/realtime/auth.js';
import { createTokenService } from '../../src/services/tokenService.js';

const tokens = createTokenService({
  JWT_SECRET: 'unit-test-secret-unit-test-secret-1234',
  JWT_EXPIRES_IN: '1h',
});
const user = { _id: '65f1c2a4b9d3e8a1c4f7b001', status: 'active', role: 'customer' };
const handshake = (overrides = {}) =>
  authenticateHandshake({
    token: tokens.sign(user),
    tokens,
    findUser: async () => user,
    ...overrides,
  });
const failure = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return null;
};

describe('authenticateHandshake', () => {
  it('returns the user and when the token expires', async () => {
    const findUser = vi.fn().mockResolvedValue(user);
    const out = await handshake({ findUser });
    expect(out.user).toBe(user);
    expect(findUser).toHaveBeenCalledWith(user._id);
    expect(out.expiresAt - Date.now()).toBeGreaterThan(59 * 60 * 1000);
    expect(out.expiresAt - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('accepts a token with a Bearer prefix', async () => {
    const out = await handshake({ token: `Bearer ${tokens.sign(user)}` });
    expect(out.user).toBe(user);
  });

  it.each([undefined, null, '', 123, {}, 'x'.repeat(2001)])(
    'rejects the token %s',
    async (token) => {
      const err = await failure(handshake({ token }));
      expect(err).toBeInstanceOf(SocketAuthError);
      expect(err.code).toBe('unauthenticated');
    },
  );

  it('rejects a token that is not valid', async () => {
    const err = await failure(handshake({ token: 'not.a.token' }));
    expect(err).toMatchObject({ code: 'invalid_token' });
  });

  it('rejects a valid token for a user who no longer exists', async () => {
    const err = await failure(handshake({ findUser: async () => null }));
    expect(err).toMatchObject({ code: 'invalid_token' });
  });

  it('rejects a suspended account but lets a pending one connect', async () => {
    const suspended = await failure(
      handshake({ findUser: async () => ({ ...user, status: 'suspended' }) }),
    );
    expect(suspended).toMatchObject({ code: 'account_suspended' });

    const pending = { ...user, status: 'pending' };
    expect((await handshake({ findUser: async () => pending })).user).toBe(pending);
  });

  it('passes other failures through, such as the database being down', async () => {
    const err = await failure(
      handshake({ findUser: async () => Promise.reject(new Error('db down')) }),
    );
    expect(err).not.toBeInstanceOf(SocketAuthError);
    expect(err.message).toBe('db down');
  });
});

describe('msUntil', () => {
  it('counts down to the expiry and never goes below zero', () => {
    expect(msUntil(10_000, 4_000)).toBe(6_000);
    expect(msUntil(10_000, 20_000)).toBe(0);
  });

  it('means "never" when there is no expiry', () => {
    expect(msUntil(null)).toBeNull();
  });

  it('never returns a value setTimeout cannot handle', () => {
    expect(msUntil(Date.now() + 90 * 24 * 3600 * 1000)).toBe(MAX_TIMER_MS);
  });
});
