import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
    env: { NODE_ENV: 'test' },
    // The pg pool is shared process-wide; serial files avoid cross-test races.
    fileParallelism: false,
  },
});
