<script setup lang="ts">
import type { RawSource } from '@/features/nuxt/types'
import { computed, ref, watch } from 'vue'
import { useShiki } from '@/composables/useShiki'

const props = defineProps<{
  source: RawSource
}>()
const html = ref('')
const failed = ref(false)
const preview = computed(() => props.source.text?.slice(0, 100000) ?? '')
let revision = 0
watch(() => props.source, async (source) => {
  const ticket = ++revision
  html.value = ''
  failed.value = false
  if (source.text === null || source.bytes > 100000)
    return
  try {
    const highlighter = await useShiki().initHighlighter()
    if (ticket !== revision)
      return
    html.value = highlighter.codeToHtml(source.text, { lang: 'json', themes: { light: 'vitesse-light', dark: 'vitesse-dark' } })
  }
  catch {
    if (ticket === revision)
      failed.value = true
  }
}, { immediate: true })
</script>

<template>
  <div class="raw-viewer">
    <p v-if="source.error" class="notice notice-warning">
      {{ source.error }}
    </p>
    <p v-if="source.text === null" class="empty-section">
      未取得该来源的原文。
    </p>
    <template v-else>
      <p v-if="source.text.length > preview.length" class="notice">
        仅预览前 100,000 个字符；导出保留完整已采集原文。
      </p>
      <p v-if="failed" class="notice">
        高亮不可用，已切换到纯文本。
      </p>
      <div v-if="html" class="raw-code" v-html="html" />
      <pre v-else class="raw-code raw-plain">{{ preview }}</pre>
    </template>
  </div>
</template>
