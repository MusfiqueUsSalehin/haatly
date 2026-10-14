import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from '../../src/config/env.js';

const valid = { MONGODB_URI: 'mongodb://127.0.0.1:27017/haatly' };

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(5000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.CLIENT_ORIGINS).toEqual(['http://localhost:5173']);
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
    expect(() => parseEnv({ MONGODB_URI: 'http://example.com' })).toThrow(/mongodb/);
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
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(parseEnv(valid))).toBe(true);
  });
});
