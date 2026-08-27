import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
    env: { NODE_ENV: 'test', DB_NAME: 'canvas_test' },
    setupFiles: ['./src/__tests__/setup.ts'],
    // The pg pool is shared process-wide; serial files avoid cross-test races.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/__tests__/**',
        'src/index.ts',
        // Needs a live S3 bucket; exercised in production, not in CI.
        'src/storage/S3Storage.ts',
        // The socket wiring needs a real server; its authorisation logic is
        // tested directly, and the sync protocol is covered end to end.
        'src/collab/yjsServer.ts',
      ],
      thresholds: { lines: 70 },
      reporter: ['text-summary'],
    },
  },
});
