<script setup lang="ts">
import type { FieldDetail } from '../../workers/protocol'
import type { FieldPath } from '../inspection/model'
import { formatPath } from '../query/path'
import DataTreeNode from './DataTreeNode.vue'
import { vResizeMotion } from './motion'
import WatchButton from './WatchButton.vue'

defineProps<{
  path: FieldPath
  detail: FieldDetail | null
  loading: boolean
  error: string
  sourceLabels: string[]
  watchedPaths: ReadonlySet<string>
  pendingWatchPaths: ReadonlySet<string>
}>()
const emit = defineEmits<{
  close: []
  notice: [message: string]
  watch: [path: FieldPath]
  locate: [path: FieldPath]
}>()
</script>

<template>
  <aside v-resize-motion="loading" class="field-detail" aria-label="字段详情" :aria-busy="loading">
    <div class="feature-heading">
      <h3>字段详情</h3><button class="btn btn-xs btn-ghost" @click="emit('close')">
        关闭
      </button>
    </div><p class="mono break-text">
      {{ formatPath(path) }}
    </p>
    <p v-if="loading" class="feature-caption" role="status">
      正在读取字段…
    </p>
    <p v-else-if="error" class="notice notice-warning" role="alert">
      {{ error }}
    </p>
    <template v-else-if="detail">
      <p class="feature-caption">
        {{ detail.sourceIds.length > 1 ? '同名顶层字段曾被覆盖，最后一份为当前来源：' : '字段来源：' }}{{ sourceLabels.join(' → ') }}
      </p><WatchButton :path="detail.path" :watched="watchedPaths.has(formatPath(detail.path))" :busy="pendingWatchPaths.has(formatPath(detail.path))" label="关注此字段" @toggle="emit('watch', $event)" /><DataTreeNode v-if="detail.tree" :key="formatPath(detail.path)" :node="detail.tree.root" :watched-paths="watchedPaths" :pending-watch-paths="pendingWatchPaths" initial-open @notice="emit('notice', $event)" @watch="emit('watch', $event)" @locate="emit('locate', $event)" /><p v-else class="feature-caption">
        {{ detail.known ? '字段不存在。' : '索引未覆盖此路径，无法确认。' }}
      </p><p v-if="detail.tree?.truncated" class="feature-caption">
        局部视图达到 10,000 节点／60 层限制。
      </p>
    </template>
  </aside>
</template>
