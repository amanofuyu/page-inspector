<script setup lang="ts">
import type { SeoSnapshot } from '../model'
import { computed } from 'vue'
import UiDisclosure from '@/components/ui/UiDisclosure.vue'

const props = defineProps<{ dom: SeoSnapshot, html: SeoSnapshot | null, sourceNotice: string }>()
const sourceLabel = computed(() => !props.html ? '尚未捕获本次文档 HTML' : props.html.source === 'refetch-reference' ? '参考 HTML · 重新请求' : '初始 HTML · 已关联本次文档响应')
</script>

<template>
  <UiDisclosure class="disclosure-section seo-source" :label="sourceLabel">
    <p class="break-text">
      当前 DOM：{{ dom.url }} ·
      {{ new Date(dom.sampledAt).toLocaleTimeString() }}
    </p>
    <p v-if="html" class="break-text">
      HTML：{{ html.url }} ·
      {{ new Date(html.sampledAt).toLocaleTimeString() }} · HTTP
      {{ html.status }}
    </p>
    <p>
      初始 HTML 可能来自 SSR、预渲染或缓存；当前 DOM
      同时包含初始标签与客户端变化。
    </p>
    <p v-if="!html">
      可在 DevTools 中刷新并捕获实际文档，或重新请求 HTML
      作参考。参考差异不能证明 CSR 来源。
    </p>
    <p v-if="sourceNotice">
      {{ sourceNotice }}
    </p>
    <p
      v-for="reason in [...dom.reasons, ...(html?.reasons ?? [])]"
      :key="reason"
    >
      {{ reason }}
    </p>
  </UiDisclosure>
</template>
