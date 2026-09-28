<script setup lang="ts">
import { ref } from 'vue'
import { useAsyncData, useFetch, useRoute, useRuntimeConfig } from '#imports'

const route = useRoute()
const version = Number(route.query.version || 1)
const shared = { marker: '共享对象', message: '中文😀\n\\'.repeat(18000) }
const { data } = await useAsyncData('feature-lab', () => Promise.resolve({
  version,
  'marker': 'nuxt3-features',
  'watched': version === 3 ? { added: true } : { price: version === 2 ? '220' : 120 },
  'products': (version === 2 ? [2, 1] : [1, 2]).map(id => ({ id, price: id * 120, active: id === 1 })),
  'sharedA': shared,
  'sharedB': shared,
  'key.with.dot': { 'quote"key': false },
  'many': Object.fromEntries(Array.from({ length: 12000 }, (_, index) => [`field${index}`, index])),
}))
// 这次调用在 SSR 服务端完成，用于验证不能在浏览器请求列表虚构调用链。
await useFetch('/api/catalog', { key: 'server-only-catalog' })
const response = ref('尚未请求')
const base = useRuntimeConfig().app.baseURL
async function clientRequest(mode: string) {
  try {
    const url = mode === 'payload' ? `${base}features/_payload.json` : `/api/inspector-probe?mode=${mode}&token=client-a`
    const result = await fetch(url)
    response.value = `${result.status} ${(await result.text()).slice(0, 400)}`
  }
  catch (error) { response.value = String(error) }
}
</script>

<template>
  <section>
    <h2>分析、检索与关注验证</h2>
    <p data-testid="feature-marker">
      {{ data?.marker }} · 版本 {{ data?.version }}
    </p>
    <p>包含长中文与 emoji、共享引用、特殊键名和 12,000 个字段。SSR 模式可用 ?version=2 或 3 验证类型变化与删除。</p>
    <div class="probe-actions">
      <button data-testid="probe-request" @click="clientRequest('json')">
        请求业务 JSON
      </button>
      <button data-testid="probe-redirect" @click="clientRequest('redirect')">
        请求重定向
      </button>
      <button data-testid="probe-compressed" @click="clientRequest('gzip')">
        请求压缩内容
      </button>
      <button data-testid="probe-cache" @click="clientRequest('cache')">
        请求缓存内容
      </button>
      <button data-testid="probe-payload" @click="clientRequest('payload')">
        请求外部 payload
      </button>
    </div>
    <pre data-testid="probe-response">{{ response }}</pre>
  </section>
</template>
