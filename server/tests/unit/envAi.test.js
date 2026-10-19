import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';

const valid = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/haatly',
  JWT_SECRET: 'a-long-random-secret-for-tests-0123456789',
};

describe('parseEnv: AI settings', () => {
  it('defaults to rules only with a daily call cap', () => {
    const env = parseEnv(valid);
    expect(env.AI_PROVIDER).toBe('none');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.AI_MODEL).toBe('claude-haiku-5-5');
    expect(env.AI_TIMEOUT_MS).toBe(15000);
    expect(env.AI_MAX_CALLS_PER_DAY).toBe(500);
  });

  it('requires an API key when the provider is anthropic', () => {
    expect(() => parseEnv({ ...valid, AI_PROVIDER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => parseEnv({ ...valid, AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: '' })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
    const env = parseEnv({ ...valid, AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-test' });
    expect(env.ANTHROPIC_API_KEY).toBe('sk-test');
  });

  it('treats a blank key as missing and trims a real one', () => {
    expect(parseEnv({ ...valid, ANTHROPIC_API_KEY: '' }).ANTHROPIC_API_KEY).toBeUndefined();
    expect(parseEnv({ ...valid, ANTHROPIC_API_KEY: '  sk-test  ' }).ANTHROPIC_API_KEY).toBe(
      'sk-test',
    );
  });

  it('rejects an unknown provider and out-of-range limits', () => {
    expect(() => parseEnv({ ...valid, AI_PROVIDER: 'openai' })).toThrow(/AI_PROVIDER/);
    expect(() => parseEnv({ ...valid, AI_TIMEOUT_MS: '10' })).toThrow(/AI_TIMEOUT_MS/);
    expect(() => parseEnv({ ...valid, AI_MAX_CALLS_PER_DAY: '-1' })).toThrow(
      /AI_MAX_CALLS_PER_DAY/,
    );
    expect(parseEnv({ ...valid, AI_MAX_CALLS_PER_DAY: '0' }).AI_MAX_CALLS_PER_DAY).toBe(0);
  });
});
