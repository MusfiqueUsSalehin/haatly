import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { createTokenService } from '../../src/services/tokenService.js';

const env = { JWT_SECRET: 'unit-test-secret-unit-test-secret-1234', JWT_EXPIRES_IN: '7d' };
const user = { _id: '65f1c2a4b9d3e8a1c4f7b001' };

describe('token service', () => {
  const tokens = createTokenService(env);

  it('signs a token whose subject is the user id and verifies it', () => {
    const payload = tokens.verify(tokens.sign(user));
    expect(payload.sub).toBe(user._id);
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it('puts no role or status in the token', () => {
    const payload = tokens.verify(tokens.sign({ ...user, role: 'admin' }));
    expect(payload.role).toBeUndefined();
    expect(payload.status).toBeUndefined();
  });

  it('rejects a token signed with a different secret', () => {
    const other = createTokenService({
      ...env,
      JWT_SECRET: 'another-secret-another-secret-12345',
    });
    expect(() => tokens.verify(other.sign(user))).toThrow();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({}, env.JWT_SECRET, { subject: user._id, expiresIn: -10 });
    expect(() => tokens.verify(expired)).toThrow(/expired/);
  });

  it('rejects an unsigned (alg none) token', () => {
    const none = jwt.sign({ sub: user._id }, '', { algorithm: 'none' });
    expect(() => tokens.verify(none)).toThrow();
  });

  it('rejects a token using a different algorithm', () => {
    const hs512 = jwt.sign({}, env.JWT_SECRET, { algorithm: 'HS512', subject: user._id });
    expect(() => tokens.verify(hs512)).toThrow();
  });

  it('rejects garbage', () => {
    expect(() => tokens.verify('not.a.token')).toThrow();
  });
});
