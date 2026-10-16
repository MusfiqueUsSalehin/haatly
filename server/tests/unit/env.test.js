import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from '../../src/config/env.js';

const valid = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/haatly',
  JWT_SECRET: 'a-long-random-secret-for-tests-0123456789',
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(5000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.CLIENT_ORIGINS).toEqual(['http://localhost:5173']);
    expect(env.JWT_EXPIRES_IN).toBe('7d');
    expect(env.TRUST_PROXY).toBe(0);
    expect(env.AUTH_RATE_LIMIT_MAX).toBe(20);
  });

  it('coerces PORT from a string', () => {
    expect(parseEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it('splits CLIENT_ORIGINS on commas and trims whitespace', () => {
    const env = parseEnv({
      ...valid,
      CLIENT_ORIGINS: 'http://localhost:5173, https://haatly.example',
    });
    expect(env.CLIENT_ORIGINS).toEqual(['http://localhost:5173', 'https://haatly.example']);
  });

  it('fails when MONGODB_URI is missing', () => {
    expect(() => parseEnv({})).toThrow(EnvError);
    expect(() => parseEnv({})).toThrow(/MONGODB_URI/);
  });

  it('rejects a non-mongodb URI', () => {
    expect(() => parseEnv({ ...valid, MONGODB_URI: 'http://example.com' })).toThrow(/mongodb/);
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => parseEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects an invalid origin', () => {
    expect(() => parseEnv({ ...valid, CLIENT_ORIGINS: 'not a url' })).toThrow(/CLIENT_ORIGINS/);
  });

  it('reports every problem at once', () => {
    let message = '';
    try {
      parseEnv({ PORT: 'abc', NODE_ENV: 'staging' });
    } catch (err) {
      message = err.message;
    }
    expect(message).toContain('NODE_ENV');
    expect(message).toContain('PORT');
    expect(message).toContain('MONGODB_URI');
    expect(message).toContain('JWT_SECRET');
  });

  it('requires a JWT_SECRET of at least 32 characters', () => {
    expect(() => parseEnv({ ...valid, JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET/);
    expect(() => parseEnv({ MONGODB_URI: valid.MONGODB_URI })).toThrow(/JWT_SECRET/);
  });

  it('refuses a placeholder JWT_SECRET in production only', () => {
    const placeholder = 'change-me-change-me-change-me-change-me';
    expect(() => parseEnv({ ...valid, NODE_ENV: 'production', JWT_SECRET: placeholder })).toThrow(
      /placeholder/,
    );
    expect(parseEnv({ ...valid, NODE_ENV: 'development', JWT_SECRET: placeholder })).toBeTruthy();
  });

  it('validates JWT_EXPIRES_IN, TRUST_PROXY and AUTH_RATE_LIMIT_MAX', () => {
    expect(() => parseEnv({ ...valid, JWT_EXPIRES_IN: 'forever' })).toThrow(/JWT_EXPIRES_IN/);
    expect(() => parseEnv({ ...valid, TRUST_PROXY: '-1' })).toThrow(/TRUST_PROXY/);
    expect(() => parseEnv({ ...valid, AUTH_RATE_LIMIT_MAX: '0' })).toThrow(/AUTH_RATE_LIMIT_MAX/);
    const env = parseEnv({ ...valid, JWT_EXPIRES_IN: '12h', TRUST_PROXY: '1' });
    expect(env.JWT_EXPIRES_IN).toBe('12h');
    expect(env.TRUST_PROXY).toBe(1);
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(parseEnv(valid))).toBe(true);
  });
});
