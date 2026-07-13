import { defineConfig, devices } from '@playwright/test';
__OPTIONAL_REPORTER_IMPORTS__

const reportDir = process.env.E2E_REGRESSION_PLAYWRIGHT_REPORT_DIR || 'artifacts/playwright-report';
__OPTIONAL_REPORTER_SETUP__

export default defineConfig({
  testDir: '.',
  outputDir: process.env.E2E_REGRESSION_PLAYWRIGHT_OUTPUT_DIR || 'artifacts/playwright',
  reporter: [
    ['list'],
    ['html', {
      outputFolder: reportDir,
      open: 'never',
    }],
__OPTIONAL_REPORTER_ENTRIES__
  ],
  use: {
    headless: process.env.E2E_REGRESSION_HEADLESS !== '0',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
