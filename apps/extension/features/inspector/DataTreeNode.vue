<script setup lang="ts">
import type { ToastInput } from '@/composables/useToast'
import type { DataNode } from '@/features/nuxt/format'
import { ChevronRight } from '@lucide/vue'
import { ref } from 'vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiNotice from '@/components/ui/UiNotice.vue'
import ExpandTransition from './ExpandTransition.vue'
import FieldCopyActions from './FieldCopyActions.vue'

const props = defineProps<{
  node: DataNode
  initialOpen?: boolean
  resolveNode?: (node: DataNode) => DataNode
  active?: boolean
}>()
const emit = defineEmits<{
  notice: [notice: ToastInput]
}>()
const expanded = ref(props.initialOpen ?? false)
const limit = ref(100)
function toggle() {
  if (!props.node.children)
    return
  expanded.value = !expanded.value
}
</script>

<template>
  <div class="tree-node">
    <div class="tree-row" :data-type="node.type">
      <component
        :is="node.children ? 'button' : 'div'"
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
      <div v-if="expanded && node.children" class="tree-children">
        <DataTreeNode v-for="child in node.children.slice(0, limit)" :key="child.path" :node="child" :resolve-node="resolveNode" :active="active" @notice="emit('notice', $event)" />
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
