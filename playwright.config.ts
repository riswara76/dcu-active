import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (TEST-PLAN §2, Phase 4) against the PRODUCTION build served by `vite preview`
 * (same CSP/security headers as hosting) and the LOCAL Supabase stack (`npm run db:start`).
 * Tests share one database, so they run one at a time.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build:only && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    // Full suite on the primary target: Android phone (Chrome).
    { name: 'android-chrome', use: { ...devices['Pixel 7'] } },
    // iPhone (WebKit engine) and desktop: smoke-level coverage of the core journeys (@smoke).
    { name: 'iphone-webkit', use: { ...devices['iPhone 14'] }, grep: /@smoke/ },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] }, grep: /@smoke/ },
  ],
});
