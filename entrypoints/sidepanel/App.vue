<script lang="ts" setup>
import type { NuxtPayloadResult } from '@/entrypoints/background/message/crawl'
import { useColorModeMessageHandler } from '@/composables/useMessageHandler'
import { useShiki } from '@/composables/useShiki'
import { sendMessage } from '@/libs/messaging'

const nuxtData = ref<string | null>(null)

async function getCrawlData() {
  const result = await sendMessage('crawl', undefined)

  if (!result?.ssrData) {
    return
  }

  const code = JSON.stringify((result.ssrData as NuxtPayloadResult).data, null, 2)

  const { highlighter, initHighlighter } = useShiki()

  if (!highlighter.value) {
    await initHighlighter()
  }

  const html = highlighter.value!.codeToHtml(code, {
    lang: 'json',
    themes: {
      light: 'vitesse-light',
      dark: 'vitesse-dark',
    },
  })

  nuxtData.value = html
}

getCrawlData()

useColorModeMessageHandler()
</script>

<template>
  <div class="px-5 py-6 flex flex-col gap-6">
    <header class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        Page Inspector
      </h1>

      <nav>
        <ThemeController />
      </nav>
    </header>

    <main class="flex flex-col gap-6">
      <div v-if="nuxtData" class="pre-wrapper" v-html="nuxtData" />
      <div v-else>
        <p>No SSR data found</p>
      </div>
    </main>
  </div>
</template>

<style>
@reference '~/assets/css/main.css';

.pre-wrapper pre {
  @apply overflow-x-auto overflow-y-hidden rounded-lg shadow shadow-primary/20 p-4;
}
</style>
