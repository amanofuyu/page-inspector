<script setup lang="ts">
import type { DataNode } from '../nuxt/format'
import type { ToastInput } from '@/composables/useToast'
import { Copy, Link } from '@lucide/vue'
import { copyNodeValue } from '../nuxt/copy'
import { exportNode } from '../nuxt/format'
import { formatPath } from '../query/path'

const props = defineProps<{ node: DataNode, loading?: boolean }>()
const emit = defineEmits<{ notice: [notice: ToastInput] }>()
async function copy(mode: 'value' | 'key' | 'typed' | 'path') {
  let text: string
  let message: string
  try {
    if (mode === 'value') {
      const result = copyNodeValue(props.node)
      text = result.text
      message = result.format === 'javascript' ? '已复制当前值（JavaScript 表达式）' : '已复制当前值'
    }
    else if (mode === 'key') {
      text = props.node.key
      message = '已复制当前属性名'
    }
    else if (mode === 'path') {
      text = props.node.fieldPath ? formatPath(props.node.fieldPath) : props.node.path
      message = '已复制字段路径'
    }
    else {
      text = exportNode(props.node)
      message = '已复制带类型的数据'
    }
  }
  catch (error) {
    emit('notice', { message: error instanceof Error ? error.message : '当前值暂时无法复制，请使用带类型的数据复制。', kind: 'warning' })
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    emit('notice', { message, kind: 'success' })
  }
  catch {
    emit('notice', { message: '复制失败，请重试或使用导出功能。', kind: 'error' })
  }
}
</script>

<template>
  <button class="btn btn-xs btn-ghost" :disabled="loading" title="复制当前值：字符串为完整文本，对象和数组为 JSON，特殊类型为 JavaScript 表达式" aria-label="复制当前值" @click="copy('value')">
    <Copy :size="13" aria-hidden="true" />复制当前值
  </button>
  <button class="btn btn-xs btn-ghost" title="仅复制当前属性名" aria-label="复制当前属性" @click="copy('key')">
    <Copy :size="13" aria-hidden="true" />复制当前属性
  </button>
  <button class="btn btn-xs btn-ghost" :disabled="loading" title="复制带类型的数据" aria-label="复制带类型的数据" @click="copy('typed')">
    <Copy :size="13" aria-hidden="true" />带类型数据
  </button>
  <button class="btn btn-xs btn-ghost" title="复制字段路径" aria-label="复制字段路径" @click="copy('path')">
    <Link :size="13" aria-hidden="true" />复制路径
  </button>
</template>
