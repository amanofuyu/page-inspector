<script setup lang="ts">
import type { FieldPath } from '../inspection/model'
import { Star } from '@lucide/vue'
import { formatPath } from '../query/path'

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
  <button class="btn btn-ghost btn-xs watch-button" :class="{ 'is-watched': watched }" :aria-pressed="watched" :aria-busy="busy || undefined" :disabled="busy" :aria-label="`${watched ? '取消关注字段' : '关注字段'} ${formatPath(path)}`" :title="watched ? '已关注，点击取消关注' : '关注字段'" @click="emit('toggle', path)">
    <Star :size="12" :fill="watched ? 'currentColor' : 'none'" aria-hidden="true" /><span v-if="!iconOnly">{{ busy ? '处理中…' : watched ? '已关注' : label || '关注' }}</span>
  </button>
</template>
