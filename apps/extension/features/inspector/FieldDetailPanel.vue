<script setup lang="ts">
import type { FieldDetail } from '../../workers/protocol'
import type { FieldPath } from '../inspection/model'
import type { DataNode } from '../nuxt/format'
import type { ToastInput } from '@/composables/useToast'
import { PanelRightClose } from '@lucide/vue'
import { computed } from 'vue'
import { formatPath } from '../query/path'
import DataTreeNode from './DataTreeNode.vue'
import FieldCopyActions from './FieldCopyActions.vue'
import { vResizeMotion } from './motion'
import WatchButton from './WatchButton.vue'

const props = defineProps<{
  node?: DataNode
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
  notice: [notice: ToastInput]
  watch: [path: FieldPath]
  locate: [path: FieldPath]
}>()
const currentNode = computed(() => props.detail?.tree?.root ?? props.node)
const fieldPath = computed(() => currentNode.value?.fieldPath)
const canWatch = computed(() => fieldPath.value !== undefined && fieldPath.value.at(-1)?.kind !== 'map-entry')
const fullValue = computed(() => {
  const node = currentNode.value
  return node?.value === undefined ? node?.reference ?? node?.preview : String(node.value)
})
</script>

<template>
  <aside v-resize-motion="node ? null : loading" class="field-detail" :class="{ 'data-field-detail': node }" aria-label="字段详情" :aria-busy="loading">
    <template v-if="node">
      <div class="detail-pane-heading">
        <h3>字段详情</h3>
        <button class="btn btn-xs btn-ghost icon-button" aria-label="收起字段详情" title="收起字段详情" @click="emit('close')">
          <PanelRightClose :size="15" aria-hidden="true" />
        </button>
      </div>
      <div class="detail-pane-body">
        <h4 class="detail-field-name">
          {{ node.key }}
        </h4>
        <p class="feature-caption">
          {{ currentNode?.type }}
        </p>
        <p class="detail-label">
          字段路径
        </p>
        <p class="mono break-text">
          {{ node.fieldPath ? formatPath(node.fieldPath) : node.path }}
        </p>
        <p v-if="loading" class="feature-caption" role="status">
          正在读取字段…
        </p>
        <p v-else-if="error" class="notice notice-warning" role="alert">
          {{ error }}
        </p>
        <p v-else-if="detail && !detail.tree" class="notice notice-warning">
          {{ detail.known ? '字段不存在，以下保留当前分类中的展示值。' : '索引未覆盖此路径，以下仅展示当前分类中的数据。' }}
        </p>
        <div class="detail-actions">
          <FieldCopyActions v-if="currentNode" :node="currentNode" :loading="loading" @notice="emit('notice', $event)" />
          <WatchButton v-if="canWatch && fieldPath" :path="fieldPath" :watched="watchedPaths.has(formatPath(fieldPath))" :busy="pendingWatchPaths.has(formatPath(fieldPath))" @toggle="emit('watch', $event)" />
        </div>
        <p class="detail-label">
          {{ currentNode?.children ? '结构与值' : '完整值' }}
        </p>
        <DataTreeNode v-if="currentNode?.children" :key="currentNode.path" :node="currentNode" initial-open hide-actions />
        <pre v-else class="detail-value">{{ fullValue }}</pre>

        <p v-if="sourceLabels.length" class="feature-caption">
          {{ detail && detail.sourceIds.length > 1 ? '来源覆盖顺序：' : '字段来源：' }}{{ sourceLabels.join(' → ') }}
        </p>
        <p v-if="!node.fieldPath" class="feature-caption">
          当前为元信息聚合视图，单个字段可独立选择与关注。
        </p>
        <p v-if="detail?.tree?.truncated || currentNode?.truncated" class="feature-caption">
          局部视图达到展示上限；完整已采集内容请导出原文。
        </p>
      </div>
    </template>
    <template v-else>
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
        </p>
        <div class="detail-actions">
          <FieldCopyActions v-if="detail.tree" :node="detail.tree.root" :loading="loading" @notice="emit('notice', $event)" />
          <WatchButton :path="detail.path" :watched="watchedPaths.has(formatPath(detail.path))" :busy="pendingWatchPaths.has(formatPath(detail.path))" label="关注此字段" @toggle="emit('watch', $event)" />
        </div>
        <DataTreeNode v-if="detail.tree" :key="formatPath(detail.path)" :node="detail.tree.root" :watched-paths="watchedPaths" :pending-watch-paths="pendingWatchPaths" initial-open @notice="emit('notice', $event)" @watch="emit('watch', $event)" @locate="emit('locate', $event)" /><p v-else class="feature-caption">
          {{ detail.known ? '字段不存在。' : '索引未覆盖此路径，无法确认。' }}
        </p><p v-if="detail.tree?.truncated" class="feature-caption">
          局部视图达到 10,000 节点／60 层限制。
        </p>
      </template>
    </template>
  </aside>
</template>
