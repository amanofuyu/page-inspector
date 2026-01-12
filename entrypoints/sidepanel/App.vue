<script lang="ts" setup>
import type { CrawlResult } from '@/libs/messaging'
import { sendMessage } from '@/libs/messaging'

const nuxtData = shallowRef<CrawlResult | null>(null)

async function getCrawlData() {
  const result = await sendMessage('crawl', undefined)
  nuxtData.value = result
}
</script>

<template>
  <div class="p-6 prose">
    <header>
      <h1>Page Inspector</h1>
    </header>

    <main>
      <div>
        <button class="btn btn-primary" @click="getCrawlData">
          获取 Nuxt 数据
        </button>
      </div>

      <div>
        <pre>
          {{ JSON.stringify(nuxtData, null, 2) }}
        </pre>
      </div>
    </main>
  </div>
</template>
