<script setup lang="ts">
import type { SeoSnapshot } from '../model'
import UiDisclosure from '@/components/ui/UiDisclosure.vue'

defineProps<{ dom: SeoSnapshot | null, html: SeoSnapshot | null, sourceNotice: string }>()
</script>

<template>
  <UiDisclosure v-if="dom || html" class="disclosure-section seo-source" label="数据来源与采样时间">
    <p v-if="dom" class="break-text">
      当前 DOM：{{ dom.url }} · {{ new Date(dom.sampledAt).toLocaleTimeString() }}
    </p>
    <p v-if="html" class="break-text">
      文档响应 HTML：{{ html.url }} · {{ new Date(html.sampledAt).toLocaleTimeString() }} · HTTP {{ html.status }}
    </p>
    <p v-if="dom?.headers" class="break-text">
      已观察文档响应头：HTTP {{ dom.status }} · {{ dom.requestId }}
    </p>
    <p v-if="sourceNotice">
      {{ sourceNotice }}
    </p>
    <p v-for="reason in [...(dom?.reasons ?? []), ...(html?.reasons ?? [])]" :key="reason">
      {{ reason }}
    </p>
  </UiDisclosure>
</template>
