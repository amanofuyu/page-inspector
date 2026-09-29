<script setup lang="ts">
import { Info, RefreshCw } from '@lucide/vue'
import { computed } from 'vue'
import ThemeController from '@/components/theme-controller.vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'

const props = defineProps<{ pageTitle: string, currentUrl: string, contextOpen: boolean, refreshing: boolean }>()
const emit = defineEmits<{ context: [], refresh: [] }>()
const pageAddress = computed(() => {
  if (!props.currentUrl)
    return '等待当前标签页…'
  try {
    const url = new URL(props.currentUrl)
    return `${url.host}${url.pathname}` || props.currentUrl
  }
  catch { return props.currentUrl }
})
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <img class="brand-icon" src="/icon.svg" width="24" height="24" alt="" aria-hidden="true">
      <h1>Page Inspector</h1>
    </div>
    <UiTooltip :content="`${pageTitle}\n${currentUrl}`">
      <span class="header-address" tabindex="0">{{ pageAddress }}</span>
    </UiTooltip>
    <div class="header-controls">
      <UiActionButton icon-only label="页面与数据来源" :aria-expanded="contextOpen" aria-haspopup="dialog" aria-controls="page-context" @click="emit('context')">
        <Info :size="15" aria-hidden="true" />
      </UiActionButton>
      <UiActionButton icon-only class="refresh-button" :busy="refreshing" :label="refreshing ? '读取中' : '重新读取'" @click="emit('refresh')">
        <RefreshCw :size="15" :class="{ 'animate-spin': refreshing }" aria-hidden="true" />
      </UiActionButton>
      <ThemeController compact />
    </div>
  </header>
</template>
