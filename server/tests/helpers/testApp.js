import { parseEnv } from '../../src/config/env.js';
import { createLogger } from '../../src/config/logger.js';
import { createApp } from '../../src/app.js';

export function makeTestEnv(overrides = {}) {
  return parseEnv({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/haatly_test',
    JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
    AUTH_RATE_LIMIT_MAX: '1000',
    ...overrides,
  });
}

export function makeTestApp(overrides = {}) {
  const env = makeTestEnv(overrides);
  return createApp({ env, logger: createLogger(env) });
}
