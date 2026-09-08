import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5050', changeOrigin: true },
      '/collab': { target: 'ws://localhost:5050', ws: true },
    },
  },
  envDir: path.resolve(__dirname, '../..'),
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // React components are covered far better by the E2E suite than by
      // chasing a number here; gate the pure logic that carries the risk.
      include: ['src/lib/**/*.ts', 'src/store/**/*.ts', 'src/canvas/richTextLayout.ts', 'src/canvas/resize.ts'],
      exclude: [
        '**/*.test.ts',
        'src/lib/testHook.ts',
        // Thin HTTP wrappers with no branching of their own; the behaviour that
        // matters is covered by the API integration tests and the E2E suite.
        'src/lib/auth.ts',
        'src/lib/projects.ts',
        'src/lib/assets.ts',
        // Both need a live Konva stage, which the E2E suite provides.
        'src/lib/exportPdf.ts',
        'src/store/editorStore.ts',
      ],
      thresholds: { lines: 70 },
      reporter: ['text-summary'],
    },
  },
});
