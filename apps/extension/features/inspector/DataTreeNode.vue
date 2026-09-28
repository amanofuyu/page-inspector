<script setup lang="ts">
import type { FieldPath } from '@/features/inspection/model'
import type { DataNode } from '@/features/nuxt/format'
import { ChevronDown, ChevronRight, Copy, Info, Link } from '@lucide/vue'
import { ref } from 'vue'
import { exportNode } from '@/features/nuxt/format'
import { formatPath } from '@/features/query/path'
import WatchButton from './WatchButton.vue'

const props = defineProps<{
  node: DataNode
  initialOpen?: boolean
  watchedPaths?: ReadonlySet<string>
  pendingWatchPaths?: ReadonlySet<string>
}>()
const emit = defineEmits<{
  watch: [path: FieldPath]
  locate: [path: FieldPath]
  notice: [
        message: string,
  ]
}>()
const expanded = ref(props.initialOpen ?? false)
const limit = ref(100)
function toggle() {
  if (!props.node.children)
    return
  expanded.value = !expanded.value
}
async function copy(pathOnly: boolean) {
  try {
    await navigator.clipboard.writeText(pathOnly ? props.node.fieldPath ? formatPath(props.node.fieldPath) : props.node.path : exportNode(props.node))
    emit('notice', pathOnly ? '已复制字段路径' : '已复制带类型的数据')
  }
  catch {
    emit('notice', '复制失败，请使用导出功能。')
  }
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
          <ChevronDown v-if="node.children && expanded" :size="14" />
          <ChevronRight v-else-if="node.children" :size="14" />
          <span v-else>·</span>
        </span>
        <span class="tree-content">
          <span class="tree-key" :title="node.path">{{ node.key }}</span>
          <span class="tree-type">{{ node.type }}</span>
          <span class="tree-value" :title="node.reference">{{ node.preview }}</span>
        </span>
      </component>
      <span class="tree-actions">

        <button class="btn btn-ghost btn-xs" title="复制字段路径" :aria-label="`复制字段路径 ${node.path}`" @click="copy(true)"><Link :size="12" aria-hidden="true" /></button>
        <button v-if="node.fieldPath && node.fieldPath.at(-1)?.kind !== 'map-entry'" class="btn btn-ghost btn-xs" :aria-label="`字段详情 ${node.path}`" title="字段详情" @click="emit('locate', node.fieldPath)"><Info :size="12" aria-hidden="true" /></button>
        <WatchButton v-if="node.fieldPath && node.fieldPath.at(-1)?.kind !== 'map-entry'" :path="node.fieldPath" :watched="watchedPaths?.has(formatPath(node.fieldPath)) ?? false" :busy="pendingWatchPaths?.has(formatPath(node.fieldPath))" icon-only @toggle="emit('watch', $event)" />
        <button class="btn btn-ghost btn-xs" title="复制带类型的数据" :aria-label="`复制带类型的数据 ${node.path}`" @click="copy(false)"><Copy :size="12" aria-hidden="true" /></button>
      </span>
    </div>
    <div v-if="expanded && node.children" class="tree-children">
      <DataTreeNode v-for="child in node.children.slice(0, limit)" :key="child.path" :node="child" :watched-paths="watchedPaths" :pending-watch-paths="pendingWatchPaths" @notice="emit('notice', $event)" @watch="emit('watch', $event)" @locate="emit('locate', $event)" />
      <button v-if="node.children.length > limit" class="btn btn-ghost btn-xs my-1" @click="limit += 100">
        再显示 100 项（剩余 {{ node.children.length - limit }} 项）
      </button>
      <p v-if="!node.children.length && !node.truncated" class="tree-hint">
        空集合
      </p>
      <p v-if="node.truncated" class="tree-limit-hint">
        <Info :size="14" aria-hidden="true" />
        <span>已达到展示上限，完整已采集内容请导出原文。</span>
      </p>
    </div>
  </div>
</template>
