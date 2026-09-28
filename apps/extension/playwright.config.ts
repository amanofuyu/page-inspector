import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 8000 },
  reporter: 'list',
  outputDir: 'test-results/protocol',
  webServer: { command: 'node tests/e2e/server.mjs', url: 'http://127.0.0.1:4318', reuseExistingServer: false },
})
