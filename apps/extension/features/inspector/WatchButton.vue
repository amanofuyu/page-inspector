<script setup lang="ts">
import type { FieldPath } from '../inspection/model'
import { Star } from '@lucide/vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import { formatPath } from '../query/path'
import { vResizeMotion } from './motion'

defineProps<{
  path: FieldPath
  watched: boolean
  busy?: boolean
  iconOnly?: boolean
  label?: string
}>()
const emit = defineEmits<{ toggle: [path: FieldPath] }>()
</script>

<template>
  <UiActionButton class="watch-button" :class="{ 'is-watched': watched }" :icon-only="iconOnly" :aria-pressed="watched" :busy="busy" :label="`${watched ? '取消关注字段' : '关注字段'} ${formatPath(path)}`" :tooltip="watched ? '已关注，点击取消关注' : '关注字段'" @click="emit('toggle', path)">
    <span v-resize-motion.inline="iconOnly ? null : busy ? 'busy' : watched" class="watch-button-content">
      <Star :size="12" :fill="watched ? 'currentColor' : 'none'" aria-hidden="true" /><span v-if="!iconOnly">{{ busy ? '处理中…' : watched ? '已关注' : label || '关注' }}</span>
    </span>
  </UiActionButton>
</template>
