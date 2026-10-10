<script setup lang="ts">
import { Image, ImageOff } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { safeSeoUrl } from '../page-data'

const props = defineProps<{ src: string, label: string }>()
const source = computed(() => safeSeoUrl(props.src))
const failed = ref(false)
watch(source, () => failed.value = false, { flush: 'sync' })
function fail(event: Event) {
  // 地址切换后忽略旧图片的迟到错误，避免覆盖当前预览。
  if ((event.target as HTMLImageElement).getAttribute('src') === source.value)
    failed.value = true
}
</script>

<template>
  <div class="seo-thumbnail-wrap" role="img" :aria-label="`${label} · ${failed ? '图片加载失败' : source ? '图片预览' : '无预览'}`">
    <img v-if="source && !failed" :key="source" :src="source" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="seo-thumbnail" @error="fail">
    <div v-else class="seo-thumbnail-placeholder">
      <ImageOff v-if="failed" :size="28" :stroke-width="1.5" aria-hidden="true" />
      <Image v-else :size="28" :stroke-width="1.5" aria-hidden="true" />
      <span>{{ failed ? '图片加载失败' : '无预览' }}</span>
    </div>
  </div>
</template>
