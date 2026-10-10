<script setup lang="ts">
import type { ToastInput } from '@/composables/useToast'
import type { DataNode } from '@/features/nuxt/format'
import { ChevronRight } from '@lucide/vue'
import { ref, useId, watch } from 'vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiNotice from '@/components/ui/UiNotice.vue'
import ExpandTransition from './ExpandTransition.vue'
import FieldCopyActions from './FieldCopyActions.vue'

const props = defineProps<{
  node: DataNode
  initialOpen?: boolean
  selectable?: boolean
  selectedPath?: string
  resolveNode?: (node: DataNode) => DataNode
  active?: boolean
}>()
const emit = defineEmits<{
  select: [node: DataNode]
  notice: [notice: ToastInput]
}>()
defineSlots<{ detail: (props: { node: DataNode }) => unknown }>()
const expanded = ref(props.initialOpen ?? false)
const detailId = `field-detail-${useId()}`
const selectTrigger = ref<HTMLButtonElement | null>(null)
const inlineDetail = ref<HTMLElement | null>(null)
const limit = ref(100)
watch(() => props.selectedPath, (next, previous) => {
  // 详情关闭时将其中的键盘焦点移回字段行，避免焦点落到页面根节点。
  if (previous === props.node.path && next !== previous && inlineDetail.value?.contains(document.activeElement))
    selectTrigger.value?.focus()
}, { flush: 'sync' })
function toggle() {
  if (!props.node.children)
    return
  expanded.value = !expanded.value
}
</script>

<template>
  <div class="tree-node">
    <div class="tree-row" :class="{ 'tree-row-selected': selectable && selectedPath === node.path, 'tree-row-selectable': selectable }" :data-type="node.type">
      <template v-if="selectable">
        <button v-if="node.children" class="tree-expand" :aria-expanded="expanded" :aria-label="`${expanded ? '折叠' : '展开'} ${node.key}`" @click="toggle">
          <ChevronRight class="disclosure-chevron" :size="14" aria-hidden="true" />
        </button>
        <span v-else class="tree-expand-placeholder" aria-hidden="true">·</span>
        <button ref="selectTrigger" class="tree-main tree-select" :aria-expanded="selectedPath === node.path" :aria-controls="selectedPath === node.path ? detailId : undefined" :aria-label="`字段详情 ${node.path}`" @click="emit('select', node)">
          <span class="tree-content">
            <span class="tree-key" :title="node.path">{{ node.key }}</span>
            <span class="tree-type">{{ node.type }}</span>
            <span class="tree-value" :title="node.reference">{{ node.preview }}</span>
          </span>
        </button>
      </template>
      <component
        :is="node.children ? 'button' : 'div'"
        v-else
        class="tree-main"
        :class="{ 'tree-toggle': node.children }"
        :type="node.children ? 'button' : undefined"
        :aria-expanded="node.children ? expanded : undefined"
        :aria-label="node.children ? `${expanded ? '折叠' : '展开'} ${node.key}` : undefined"
        :aria-description="node.children ? `${node.type}，${node.preview}` : undefined"
        @click="toggle"
      >
        <span class="tree-indicator" aria-hidden="true">
          <ChevronRight v-if="node.children" class="disclosure-chevron" :size="14" />
          <span v-else>·</span>
        </span>
        <span class="tree-content">
          <span class="tree-key" :title="node.path">{{ node.key }}</span>
          <span class="tree-type">{{ node.type }}</span>
          <span class="tree-value" :title="node.reference">{{ node.preview }}</span>
        </span>
      </component>
      <span class="tree-actions">
        <FieldCopyActions :node="node" :resolve-node="resolveNode" :active="active" @notice="emit('notice', $event)" />
      </span>
    </div>
    <ExpandTransition>
      <div v-if="selectable && selectedPath === node.path" :id="detailId" ref="inlineDetail" class="tree-inline-detail" role="region" :aria-label="`字段详情 ${node.key}`">
        <slot name="detail" :node="node" />
      </div>
    </ExpandTransition>
    <ExpandTransition>
      <div v-if="expanded && node.children" class="tree-children">
        <DataTreeNode v-for="child in node.children.slice(0, limit)" :key="child.path" :node="child" :selectable="selectable" :selected-path="selectedPath" :resolve-node="resolveNode" :active="active" @select="emit('select', $event)" @notice="emit('notice', $event)">
          <template #detail="slotProps">
            <slot name="detail" v-bind="slotProps" />
          </template>
        </DataTreeNode>
        <UiActionButton v-if="node.children.length > limit" class="my-1" @click="limit += 100">
          再显示 100 项（剩余 {{ node.children.length - limit }} 项）
        </UiActionButton>
        <UiEmptyState v-if="!node.children.length && !node.truncated" size="inline" role="note">
          空集合
        </UiEmptyState>
        <UiNotice v-if="node.truncated" class="tree-limit-hint" severity="warning" role="note">
          已达到展示上限，完整已采集内容请导出原文。
        </UiNotice>
      </div>
    </ExpandTransition>
  </div>
</template>
