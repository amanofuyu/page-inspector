<script setup lang="ts">
import type { DataNode } from '../nuxt/format'
import type { FieldCopyMode } from './useFieldActions'
import type { ToastInput } from '@/composables/useToast'
import { Copy, Link } from '@lucide/vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import { useFieldActions } from './useFieldActions'

const props = defineProps<{ node: DataNode, loading?: boolean }>()
const emit = defineEmits<{ notice: [notice: ToastInput] }>()
const actions = useFieldActions(notice => emit('notice', notice))
function copy(mode: FieldCopyMode) {
  void actions.copy(props.node, mode)
}
</script>

<template>
  <UiActionButton :disabled="loading" tooltip="复制当前值：字符串为完整文本，对象和数组为 JSON，特殊类型为 JavaScript 表达式" label="复制当前值" @click="copy('value')">
    <Copy :size="13" aria-hidden="true" />复制当前值
  </UiActionButton>
  <UiActionButton tooltip="仅复制当前属性名" label="复制当前属性" @click="copy('key')">
    <Copy :size="13" aria-hidden="true" />复制当前属性
  </UiActionButton>
  <UiActionButton :disabled="loading" tooltip="复制带类型的数据" label="复制带类型的数据" @click="copy('typed')">
    <Copy :size="13" aria-hidden="true" />带类型数据
  </UiActionButton>
  <UiActionButton tooltip="复制字段路径" label="复制字段路径" @click="copy('path')">
    <Link :size="13" aria-hidden="true" />复制路径
  </UiActionButton>
</template>
