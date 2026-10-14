import { parseEnv } from '../../src/config/env.js';
import { createLogger } from '../../src/config/logger.js';
import { createApp } from '../../src/app.js';

export function makeTestApp(overrides = {}) {
  const env = parseEnv({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/haatly_test',
    ...overrides,
  });
  return createApp({ env, logger: createLogger(env) });
}
