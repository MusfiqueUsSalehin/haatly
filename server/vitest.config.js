import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Cap parallel workers. Launching one per CPU core can crash workers at startup
    // on machines with limited memory.
    maxWorkers: 2,
    include: ['tests/**/*.test.js'],
    // The first integration run downloads a MongoDB binary, so allow extra time.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});