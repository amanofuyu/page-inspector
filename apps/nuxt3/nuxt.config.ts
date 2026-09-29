import process from 'node:process'
import { defineNuxtConfig } from 'nuxt/config'

const profile = process.env.INSPECTOR_PROFILE || 'ssr'
if (!['ssr', 'static-inline', 'static-external'].includes(profile))
  throw new Error(`未知验证配置：${profile}`)
const isStatic = profile !== 'ssr'

export default defineNuxtConfig({
  devtools: { enabled: false },
  buildDir: `.nuxt/${profile}`,
  app: { baseURL: profile === 'static-external' ? '/inspect/' : '/' },
  experimental: { renderJsonPayloads: true, payloadExtraction: profile === 'static-external' },
  nitro: {
    output: { dir: `.output/${profile}` },
    prerender: { crawlLinks: false, routes: isStatic ? ['/', '/basic', '/types', '/state', '/custom', '/route-a', '/route-b', '/empty', '/large', '/features', '/seo', '/csr'] : [] },
  },
  routeRules: { '/csr': { ssr: false } },
})
