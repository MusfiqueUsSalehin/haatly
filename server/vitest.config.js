import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // The first integration run downloads a MongoDB binary, so allow extra time.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
