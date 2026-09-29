<script setup lang="ts">
import type { QueryCondition, QuerySpec } from '../engine'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'

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
function operations(condition: QueryCondition): QueryCondition['op'][] {
  return condition.field === 'path' ? ['eq', 'ne', 'exists', 'missing'] : condition.field === 'value' ? ['contains', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte'] : ['contains', 'eq', 'ne']
}
const labels: Record<string, string> = { contains: '包含', eq: '等于', ne: '不等于', gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于', exists: '路径存在', missing: '路径缺失' }
const categories = [{ value: 'data', label: 'data' }, { value: 'state', label: 'state' }, { value: '_errors', label: '_errors' }, { value: 'meta', label: '元信息' }, { value: 'app', label: '整个应用' }] as const
const combinations = [{ value: 'all', label: '全部满足' }, { value: 'any', label: '任一满足' }] as const
const fields = [{ value: 'path', label: '路径' }, { value: 'key', label: '键名' }, { value: 'value', label: '值' }, { value: 'type', label: '基础类型' }, { value: 'tag', label: 'Nuxt 标签' }] as const
const valueTypes = (['string', 'number', 'boolean', 'null', 'undefined', 'bigint', 'empty'] as const).map(value => ({ value, label: value }))
</script>

<template>
  <div class="query-scope">
    <div class="toolbar-field">
      <span class="toolbar-field-label">分类</span><UiSelect :model-value="modelValue.category" :items="categories" label="查询分类" @update:model-value="patch({ category: $event })" />
    </div><div class="toolbar-field">
      <span class="toolbar-field-label">条件组合</span><UiSelect :model-value="modelValue.combine" :items="combinations" label="条件组合" @update:model-value="patch({ combine: $event })" />
    </div>
  </div>
  <div v-for="(condition, index) in modelValue.conditions" :key="index" class="condition-row">
    <UiSelect :model-value="condition.field" :items="fields" :label="`条件 ${index + 1} 字段`" @update:model-value="changeField(index, $event)" />
    <UiSelect :model-value="condition.op" :items="operations(condition).map(value => ({ value, label: labels[value]! }))" :label="`条件 ${index + 1} 比较`" @update:model-value="patchCondition(index, { op: $event })" />
    <UiSelect v-if="condition.field === 'value'" :model-value="condition.valueType ?? 'string'" :items="valueTypes" :label="`条件 ${index + 1} 值类型`" @update:model-value="patchCondition(index, { valueType: $event })" />
    <UiInput :model-value="condition.value" :label="`条件 ${index + 1} 内容`" :placeholder="condition.field === 'path' ? 'products[*].price' : '比较值'" @update:model-value="patchCondition(index, { value: $event })" />
    <UiActionButton :label="`删除条件 ${index + 1}`" @click="patch({ conditions: modelValue.conditions.filter((_, position) => position !== index) })">
      移除
    </UiActionButton>
  </div>
</template>
