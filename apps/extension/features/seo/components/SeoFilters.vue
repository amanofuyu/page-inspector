<script setup lang="ts">
import type { SeoFilters } from '../useSeoViewState'
import UiSearchInput from '@/components/ui/UiSearchInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import { CHANGES, GROUPS } from '../model'

const props = defineProps<{ modelValue: SeoFilters, display: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: SeoFilters] }>()
function update(key: keyof SeoFilters, value: string) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
const groups = [{ value: 'all', label: '全部分组' }, ...Object.entries(GROUPS).map(([value, label]) => ({ value, label }))]
const changes = [{ value: 'all', label: '全部来源状态' }, { value: 'differences', label: '仅看差异' }, ...Object.entries(CHANGES).map(([value, label]) => ({ value, label }))]
const conditions = [{ value: 'all', label: '全部字段情况' }, { value: 'empty', label: 'DOM 空值' }, { value: 'missing', label: 'DOM 未发现' }, { value: 'multiple', label: 'DOM 多值／重复' }]
const severities = [{ value: 'all', label: '全部问题与提示' }, { value: 'problem', label: '问题' }, { value: 'review', label: '需要核对' }, { value: 'info', label: '信息' }]
</script>

<template>
  <div v-if="display !== 'issues'" class="seo-filters">
    <UiSearchInput :model-value="modelValue.search" label="搜索 SEO 字段" placeholder="搜索标签名称或值" @update:model-value="update('search', $event)" />
    <UiSelect :model-value="modelValue.group" :items="groups" label="SEO 分组" @update:model-value="update('group', $event)" />
    <UiSelect :model-value="modelValue.change" :items="changes" label="SEO 来源状态" @update:model-value="update('change', $event)" />
  </div>
  <UiSelect v-if="display !== 'issues'" :model-value="modelValue.condition" :items="conditions" class="w-full" label="SEO 字段情况" @update:model-value="update('condition', $event)" />
  <UiSelect v-else :model-value="modelValue.severity" :items="severities" class="w-full" label="SEO 问题等级" @update:model-value="update('severity', $event)" />
</template>
