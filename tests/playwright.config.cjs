const { defineConfig } = require('@playwright/test');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(PROJECT_ROOT, 'test-results.json') }],
    ['html', { open: 'never', outputFolder: path.join(PROJECT_ROOT, 'playwright-report') }],
  ],
  use: {
    trace: 'retain-on-failure',
  },
});