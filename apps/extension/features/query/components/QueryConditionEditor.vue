<script setup lang="ts">
import type { QueryCondition, QuerySpec } from '../engine'
import UiActionButton from '@/components/ui/UiActionButton.vue'

const props = defineProps<{ modelValue: QuerySpec }>()
const emit = defineEmits<{ 'update:modelValue': [value: QuerySpec] }>()
function patch(value: Partial<QuerySpec>) {
  emit('update:modelValue', { ...props.modelValue, ...value })
}
function patchCondition(index: number, value: Partial<QueryCondition>) {
  patch({ conditions: props.modelValue.conditions.map((condition, position) => position === index ? { ...condition, ...value } : condition) })
}
function changeField(index: number, field: QueryCondition['field']) {
  patchCondition(index, { field, op: field === 'path' ? 'eq' : 'contains' })
}
function operations(condition: QueryCondition) {
  return condition.field === 'path' ? ['eq', 'ne', 'exists', 'missing'] : condition.field === 'value' ? ['contains', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte'] : ['contains', 'eq', 'ne']
}
const labels: Record<string, string> = { contains: '包含', eq: '等于', ne: '不等于', gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于', exists: '路径存在', missing: '路径缺失' }
</script>

<template>
  <div class="query-scope">
    <label class="toolbar-field"><span class="toolbar-field-label">分类</span><select :value="modelValue.category" class="select select-sm" aria-label="查询分类" @change="patch({ category: ($event.target as HTMLSelectElement).value as QuerySpec['category'] })"><option value="data">data</option><option value="state">state</option><option value="_errors">_errors</option><option value="meta">元信息</option><option value="app">整个应用</option></select></label><label class="toolbar-field"><span class="toolbar-field-label">条件组合</span><select :value="modelValue.combine" class="select select-sm" aria-label="条件组合" @change="patch({ combine: ($event.target as HTMLSelectElement).value as QuerySpec['combine'] })"><option value="all">全部满足</option><option value="any">任一满足</option></select></label>
  </div>
  <div v-for="(condition, index) in modelValue.conditions" :key="index" class="condition-row">
    <select :value="condition.field" class="select select-sm" :aria-label="`条件 ${index + 1} 字段`" @change="changeField(index, ($event.target as HTMLSelectElement).value as QueryCondition['field'])">
      <option value="path">
        路径
      </option><option value="key">
        键名
      </option><option value="value">
        值
      </option><option value="type">
        基础类型
      </option><option value="tag">
        Nuxt 标签
      </option>
    </select>
    <select :value="condition.op" class="select select-sm" :aria-label="`条件 ${index + 1} 比较`" @change="patchCondition(index, { op: ($event.target as HTMLSelectElement).value as QueryCondition['op'] })">
      <option v-for="op in operations(condition)" :key="op" :value="op">
        {{ labels[op] }}
      </option>
    </select>
    <select v-if="condition.field === 'value'" :value="condition.valueType ?? 'string'" class="select select-sm" :aria-label="`条件 ${index + 1} 值类型`" @change="patchCondition(index, { valueType: ($event.target as HTMLSelectElement).value as QueryCondition['valueType'] })">
      <option value="string">
        string
      </option><option v-for="type in ['number', 'boolean', 'null', 'undefined', 'bigint', 'empty']" :key="type" :value="type">
        {{ type }}
      </option>
    </select>
    <input :value="condition.value" class="input input-sm" :aria-label="`条件 ${index + 1} 内容`" :placeholder="condition.field === 'path' ? 'products[*].price' : '比较值'" @input="patchCondition(index, { value: ($event.target as HTMLInputElement).value as string })">
    <UiActionButton :label="`删除条件 ${index + 1}`" @click="patch({ conditions: modelValue.conditions.filter((_, position) => position !== index) })">
      移除
    </UiActionButton>
  </div>
</template>
