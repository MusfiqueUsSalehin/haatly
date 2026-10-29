import { parseEnv } from '../../src/config/env.js';
import { createLogger } from '../../src/config/logger.js';
import { createApp } from '../../src/app.js';

export function makeTestEnv(overrides = {}) {
  return parseEnv({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/haatly_test',
    JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
    AUTH_RATE_LIMIT_MAX: '1000',
    PAYMENT_PROVIDER: 'sandbox',
    ...overrides,
  });
}

/** Build a test app. Pass { ai } and/or { payments } to use your own instead of the default. */
export function makeTestApp(overrides = {}, { ai, payments } = {}) {
  const env = makeTestEnv(overrides);
  return createApp({ env, logger: createLogger(env), ai, payments });
}
