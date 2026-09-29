<script setup lang="ts">
import type { ToastInput } from '@/composables/useToast'
import type { FieldPath } from '@/features/inspection/model'
import type { DataNode } from '@/features/nuxt/format'
import { ChevronRight, Copy, Info, Link } from '@lucide/vue'
import { ref } from 'vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import { formatPath } from '@/features/query/path'
import ExpandTransition from './ExpandTransition.vue'
import { useFieldActions } from './useFieldActions'
import WatchButton from './WatchButton.vue'

const props = defineProps<{
  node: DataNode
  initialOpen?: boolean
  watchedPaths?: ReadonlySet<string>
  pendingWatchPaths?: ReadonlySet<string>
  selectable?: boolean
  selectedPath?: string
  hideActions?: boolean
}>()
const emit = defineEmits<{
  watch: [path: FieldPath]
  locate: [path: FieldPath]
  select: [node: DataNode]
  notice: [notice: ToastInput]
}>()
const expanded = ref(props.initialOpen ?? false)
const limit = ref(100)
function toggle() {
  if (!props.node.children)
    return
  expanded.value = !expanded.value
}
const actions = useFieldActions(notice => emit('notice', notice))
function copy(pathOnly: boolean) {
  void actions.copy(props.node, pathOnly ? 'path' : 'typed')
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
        <button class="tree-main tree-select" :aria-pressed="selectedPath === node.path" :aria-label="`字段详情 ${node.path}`" title="字段详情" @click="emit('select', node)">
          <span class="tree-content">
            <span class="tree-key" :title="node.path">{{ node.key }}</span>
            <span class="tree-value" :title="node.reference">{{ node.preview }}</span>
            <span class="tree-type">{{ node.type }}</span>
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
      <span v-if="!selectable && !hideActions" class="tree-actions">

        <UiActionButton icon-only tooltip="复制字段路径" :label="`复制字段路径 ${node.path}`" @click="copy(true)"><Link :size="12" aria-hidden="true" /></UiActionButton>
        <UiActionButton v-if="node.fieldPath && node.fieldPath.at(-1)?.kind !== 'map-entry'" icon-only :label="`字段详情 ${node.path}`" tooltip="字段详情" @click="emit('locate', node.fieldPath)"><Info :size="12" aria-hidden="true" /></UiActionButton>
        <WatchButton v-if="node.fieldPath && node.fieldPath.at(-1)?.kind !== 'map-entry'" :path="node.fieldPath" :watched="watchedPaths?.has(formatPath(node.fieldPath)) ?? false" :busy="pendingWatchPaths?.has(formatPath(node.fieldPath))" icon-only @toggle="emit('watch', $event)" />
        <UiActionButton icon-only tooltip="复制带类型的数据" :label="`复制带类型的数据 ${node.path}`" @click="copy(false)"><Copy :size="12" aria-hidden="true" /></UiActionButton>
      </span>
    </div>
    <ExpandTransition>
      <div v-if="expanded && node.children" class="tree-children">
        <DataTreeNode v-for="child in node.children.slice(0, limit)" :key="child.path" :node="child" :watched-paths="watchedPaths" :pending-watch-paths="pendingWatchPaths" :selectable="selectable" :selected-path="selectedPath" :hide-actions="hideActions" @select="emit('select', $event)" @notice="emit('notice', $event)" @watch="emit('watch', $event)" @locate="emit('locate', $event)" />
        <UiActionButton v-if="node.children.length > limit" class="my-1" @click="limit += 100">
          再显示 100 项（剩余 {{ node.children.length - limit }} 项）
        </UiActionButton>
        <p v-if="!node.children.length && !node.truncated" class="tree-hint">
          空集合
        </p>
        <p v-if="node.truncated" class="tree-limit-hint">
          <Info :size="14" aria-hidden="true" />
          <span>已达到展示上限，完整已采集内容请导出原文。</span>
        </p>
      </div>
    </ExpandTransition>
  </div>
</template>
