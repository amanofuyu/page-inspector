<script setup lang="ts">
import type { FieldDetail } from '../nuxt/detail'
import type { DataNode } from '../nuxt/format'
import type { ToastInput } from '@/composables/useToast'
import { X } from '@lucide/vue'
import { computed } from 'vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import { formatPath } from '../nuxt/path'
import DataTreeNode from './DataTreeNode.vue'

const props = defineProps<{ node?: DataNode, detail: FieldDetail | null, sourceLabels: string[], resolveNode?: (node: DataNode) => DataNode, active?: boolean }>()
const emit = defineEmits<{ close: [], notice: [notice: ToastInput] }>()
const currentNode = computed(() => props.detail?.tree?.root ?? props.node)
// 普通分支直接复用主树；引用和被截断的分支才展示按字段解析的局部结构。
const localTree = computed(() => props.node?.reference || props.node?.truncated ? currentNode.value?.children : undefined)
const fullValue = computed(() => {
  const node = currentNode.value
  return node?.value === undefined ? node?.reference ?? node?.preview : String(node.value)
})
</script>

<template>
  <div class="field-detail data-field-detail" aria-label="字段详情" aria-busy="false">
    <div class="detail-inline-heading">
      <h3 class="detail-field-name">
        <span class="detail-field-key">{{ node?.key }}</span> <span class="tree-type">{{ currentNode?.type }}</span>
      </h3>
      <UiActionButton icon-only label="收起字段详情" @click="emit('close')">
        <X :size="14" aria-hidden="true" />
      </UiActionButton>
    </div>
    <div v-if="node" class="detail-pane-body">
      <p class="detail-label">
        字段路径
      </p>
      <p class="mono break-text">
        {{ node.fieldPath ? formatPath(node.fieldPath) : node.path }}
      </p>
      <p v-if="!currentNode?.children || localTree" class="detail-label">
        {{ localTree ? '完整字段结构' : '完整值' }}
      </p>
      <DataTreeNode v-if="localTree && currentNode" :key="currentNode.path" :node="currentNode" initial-open :resolve-node="resolveNode" :active="active" @notice="emit('notice', $event)" />
      <pre v-else-if="!currentNode?.children" class="detail-value">{{ fullValue }}</pre>
      <p v-if="sourceLabels.length" class="feature-caption">
        {{ detail && detail.sourceIds.length > 1 ? '来源覆盖顺序：' : '字段来源：' }}{{ sourceLabels.join(' → ') }}
      </p>
      <p v-if="!node.fieldPath" class="feature-caption">
        当前为元信息聚合视图，单个字段可独立选择。
      </p>
      <p v-if="detail?.tree?.truncated || currentNode?.truncated" class="feature-caption">
        局部视图达到展示上限；完整已采集内容请导出原文。
      </p>
    </div>
  </div>
</template>
