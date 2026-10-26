import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    // The first integration run downloads a MongoDB binary, so allow extra time.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Run test files one at a time. Each integration file starts its own temporary
    // MongoDB, and several at once can exhaust memory on small machines (workers crash
    // with exit code 134 or "fassert() failure"). It also lets files safely share one
    // database when TEST_MONGODB_URI is set.
    fileParallelism: false,
  },
});
