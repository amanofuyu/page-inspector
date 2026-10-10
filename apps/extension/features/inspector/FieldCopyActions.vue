<script setup lang="ts">
import type { DataNode } from '../nuxt/format'
import type { FieldCopyMode } from './useFieldActions'
import type { UiMenuItem } from '@/components/ui/menu'
import type { ToastInput } from '@/composables/useToast'
import { Braces, ChevronDown, Copy, Link } from '@lucide/vue'
import UiActionMenu from '@/components/ui/UiActionMenu.vue'
import { useFieldActions } from './useFieldActions'

const props = withDefaults(defineProps<{ node: DataNode, resolveNode?: (node: DataNode) => DataNode, active?: boolean }>(), { active: true })
const emit = defineEmits<{ notice: [notice: ToastInput] }>()
const actions = useFieldActions(notice => emit('notice', notice))
const items: UiMenuItem<FieldCopyMode>[] = [
  { value: 'value', label: '复制当前值', icon: Copy },
  { value: 'key', label: '复制当前属性', icon: Copy },
  { value: 'path', label: '复制字段路径', icon: Link },
  { value: 'typed', label: '复制带类型的数据', icon: Braces, separatorBefore: true },
]
function copy(mode: FieldCopyMode) {
  // 仅在复制值时解析局部树，保留引用和完整字段，避免为每一行预建详情。
  const node = mode === 'value' || mode === 'typed' ? props.resolveNode?.(props.node) ?? props.node : props.node
  void actions.copy(node, mode)
}
</script>

<template>
  <UiActionMenu :label="`复制选项 ${node.path}`" :menu-label="`复制字段 ${node.key}`" :items="items" :active="active" @select="copy">
    <Copy :size="13" aria-hidden="true" />
    <ChevronDown :size="11" aria-hidden="true" />
  </UiActionMenu>
</template>
