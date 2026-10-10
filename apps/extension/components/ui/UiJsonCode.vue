<script setup lang="ts">
import { ref, watch } from 'vue'
import { useShiki } from '@/composables/useShiki'

const props = withDefaults(defineProps<{ code: string, label: string, compact?: boolean }>(), { compact: false })
const html = ref('')
const failed = ref(false)

watch(() => props.code, async (code, _previous, onCleanup) => {
  let current = true
  onCleanup(() => {
    current = false
  })
  html.value = ''
  failed.value = false
  if (!code)
    return
  try {
    const highlighter = await useShiki().initHighlighter()
    if (current)
      html.value = highlighter.codeToHtml(code, { lang: 'json', themes: { light: 'vitesse-light', dark: 'vitesse-dark' } })
  }
  catch {
    if (current)
      failed.value = true
  }
}, { immediate: true })
</script>

<template>
  <div class="ui-json-code" :data-compact="compact" role="region" :aria-label="label" :tabindex="compact ? undefined : 0">
    <p v-if="failed" class="ui-json-code-notice" role="status">
      高亮不可用，已显示纯文本。
    </p>
    <div v-if="html" v-html="html" />
    <pre v-else>{{ code }}</pre>
  </div>
</template>
