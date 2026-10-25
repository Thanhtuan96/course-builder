import { defineConfig, devices } from '@playwright/test';

/**
 * Authoring config for the committed evidence fixture (RON-168). This project is not part of the
 * E2E suite; it is run once to produce `chromium-green.json` (see README.md).
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['json']],
  use: {
    baseURL: 'http://127.0.0.1:3095',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node serve.mjs',
    url: 'http://127.0.0.1:3095/',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
