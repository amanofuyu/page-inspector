import type { InspectorOptions } from './tests/e2e/fixtures'
import { defineConfig } from '@playwright/test'

const cases = [3, 4].flatMap(major => ['ssr', 'static-inline', 'static-external'].map((profile, index) => {
  const origin = `http://127.0.0.1:${4400 + major * 10 + index}`
  const base = `${origin}${profile === 'static-external' ? '/inspect/' : '/'}`
  return { major, profile, origin, base, port: 4400 + major * 10 + index }
}))

export default defineConfig<InspectorOptions>({
  testDir: './tests/real-nuxt',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/nuxt-results.json' }]],
  outputDir: 'test-results/real-nuxt',
  projects: cases.map(item => ({
    name: `nuxt${item.major}-${item.profile}`,
    use: { targetUrl: `${item.base}basic`, expectedText: 'products' },
    metadata: item,
  })),
  webServer: cases.map(item => ({
    command: `node ../../scripts/serve-fixture.mjs ${item.major} ${item.profile} ${item.port}`,
    url: item.base,
    reuseExistingServer: false,
    timeout: 30000,
  })),
})
