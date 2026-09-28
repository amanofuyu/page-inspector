import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/devtools',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 12000 },
  reporter: 'list',
  outputDir: 'test-results/devtools',
  webServer: { command: 'node tests/e2e/server.mjs', url: 'http://127.0.0.1:4318', reuseExistingServer: false },
})
