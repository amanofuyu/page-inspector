<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'

defineProps<{ busy: boolean, canCapture: boolean }>()
const emit = defineEmits<{
  refresh: [kind: 'dom' | 'reference' | 'navigation']
  reload: []
  cancel: []
}>()
</script>

<template>
  <div class="seo-actions">
    <UiActionButton size="sm" :busy="busy" @click="emit('refresh', 'dom')">
      <RefreshCw :size="14" :class="{ 'animate-spin': busy }" aria-hidden="true" />重新读取 SEO
    </UiActionButton>
    <UiActionButton size="sm" :disabled="busy" @click="emit('refresh', 'reference')">
      读取参考 HTML
    </UiActionButton>
    <UiActionButton v-if="canCapture" size="sm" :disabled="busy" @click="emit('refresh', 'navigation')">
      读取已捕获 HTML
    </UiActionButton>
    <UiActionButton v-if="canCapture" size="sm" :disabled="busy" @click="emit('reload')">
      刷新并捕获 HTML
    </UiActionButton>
    <UiActionButton v-if="busy" size="sm" @click="emit('cancel')">
      取消读取
    </UiActionButton>
  </div>
</template>
