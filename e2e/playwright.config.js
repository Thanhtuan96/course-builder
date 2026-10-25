/**
 * Playwright configuration for the RON-168 E2E suite.
 *
 * Built Studio + real bridge + foreign origin, all inside 3010-3099, one worker, no retries.
 * The bridge readiness probe is unauthenticated: a 401 is the expected "ready" answer.
 */
import { defineConfig } from '@playwright/test';
import { join } from 'node:path';
import {
  BRIDGE_HEALTH_URL,
  FOREIGN_ORIGIN,
  PAIRING_STATE,
  REPO_ROOT,
  STUDIO_ORIGIN,
} from './helpers/env.js';

export default defineConfig({
  testDir: '.',
  outputDir: join(REPO_ROOT, 'test-results', 'artifacts'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: join(REPO_ROOT, 'playwright-report') }],
    ['json', { outputFile: join(REPO_ROOT, 'test-results', 'results.json') }],
  ],
  use: {
    baseURL: STUDIO_ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'node',
      testMatch: /specs\/fake-agent\.spec\.js/,
    },
    {
      name: 'pair',
      testMatch: /setup\/pair\.setup\.js/,
    },
    {
      name: 'journeys',
      testMatch: /specs\/(01-generated-course|02-playwright-template)\.spec\.js/,
      dependencies: ['pair'],
      use: { storageState: PAIRING_STATE },
    },
    {
      name: 'origin',
      testMatch: /specs\/bridge-origin\.spec\.js/,
      dependencies: ['pair'],
      use: { storageState: PAIRING_STATE },
    },
  ],
  webServer: [
    {
      command: 'node e2e/helpers/serve-studio.mjs',
      cwd: REPO_ROOT,
      url: `${STUDIO_ORIGIN}/`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'node e2e/helpers/run-bridge.mjs',
      cwd: REPO_ROOT,
      // A 401 from the token guard is a healthy bridge; Playwright accepts it as ready.
      url: BRIDGE_HEALTH_URL,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'node e2e/helpers/serve-foreign.mjs',
      cwd: REPO_ROOT,
      url: `${FOREIGN_ORIGIN}/`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
  globalTeardown: './helpers/global-teardown.js',
});
