<script setup lang="ts">
import type { FieldDetail } from '../nuxt/detail'
import type { DataNode } from '../nuxt/format'
import type { ToastInput } from '@/composables/useToast'
import { PanelRightClose } from '@lucide/vue'
import { computed } from 'vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import { formatPath } from '../nuxt/path'
import DataTreeNode from './DataTreeNode.vue'
import FieldCopyActions from './FieldCopyActions.vue'

const props = defineProps<{ node?: DataNode, detail: FieldDetail | null, sourceLabels: string[] }>()
const emit = defineEmits<{ close: [], notice: [notice: ToastInput] }>()
const currentNode = computed(() => props.detail?.tree?.root ?? props.node)
const fullValue = computed(() => {
  const node = currentNode.value
  return node?.value === undefined ? node?.reference ?? node?.preview : String(node.value)
})
</script>

<template>
  <aside class="field-detail data-field-detail" aria-label="字段详情" aria-busy="false">
    <div class="detail-pane-heading">
      <h3>字段详情</h3>
      <UiActionButton icon-only label="收起字段详情" @click="emit('close')">
        <PanelRightClose :size="15" aria-hidden="true" />
      </UiActionButton>
    </div>
    <div v-if="node" class="detail-pane-body">
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
      <div class="detail-actions">
        <FieldCopyActions v-if="currentNode" :node="currentNode" @notice="emit('notice', $event)" />
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
        当前为元信息聚合视图，单个字段可独立选择。
      </p>
      <p v-if="detail?.tree?.truncated || currentNode?.truncated" class="feature-caption">
        局部视图达到展示上限；完整已采集内容请导出原文。
      </p>
    </div>
  </aside>
</template>
