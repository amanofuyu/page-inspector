<script setup lang="ts">
import type { FieldPath } from '../inspection/model'
import { Star } from '@lucide/vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
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
  <UiTooltip :content="watched ? '已关注，点击取消关注' : '关注字段'" :disabled="busy">
    <button v-resize-motion.inline="iconOnly ? null : busy ? 'busy' : watched" class="btn btn-ghost btn-xs watch-button" :class="{ 'is-watched': watched }" :aria-pressed="watched" :aria-busy="busy || undefined" :disabled="busy" :aria-label="`${watched ? '取消关注字段' : '关注字段'} ${formatPath(path)}`" @click="emit('toggle', path)">
      <Star :size="12" :fill="watched ? 'currentColor' : 'none'" aria-hidden="true" /><span v-if="!iconOnly">{{ busy ? '处理中…' : watched ? '已关注' : label || '关注' }}</span>
    </button>
  </UiTooltip>
</template>
