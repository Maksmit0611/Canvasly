import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 5173;
const API_PORT = 5050;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Reuse whatever is already running locally; start both in CI.
  webServer: [
    {
      command: 'npm run dev --workspace=apps/api',
      url: `http://localhost:${API_PORT}/api/health`,
      cwd: '../..',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev --workspace=apps/web',
      url: `http://localhost:${WEB_PORT}`,
      cwd: '../..',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
