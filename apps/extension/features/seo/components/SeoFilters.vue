<script setup lang="ts">
import type { SeoFilters } from '../useSeoViewState'
import { Search } from '@lucide/vue'
import { CHANGES, GROUPS } from '../model'

const props = defineProps<{ modelValue: SeoFilters, display: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: SeoFilters] }>()
function update(key: keyof SeoFilters, event: Event) {
  emit('update:modelValue', { ...props.modelValue, [key]: (event.target as HTMLInputElement).value })
}
</script>

<template>
  <div v-if="display !== 'issues'" class="seo-filters">
    <label class="search-input"><Search :size="15" aria-hidden="true" /><input
      :value="modelValue.search" type="search"
      aria-label="搜索 SEO 字段"
      placeholder="搜索标签名称或值"
      @input="update('search', $event)"
    ></label>
    <select :value="modelValue.group" class="select select-sm" aria-label="SEO 分组" @change="update('group', $event)">
      <option value="all">
        全部分组
      </option>
      <option v-for="(label, key) in GROUPS" :key="key" :value="key">
        {{ label }}
      </option>
    </select>
    <select
      :value="modelValue.change" class="select select-sm"
      aria-label="SEO 来源状态"
      @change="update('change', $event)"
    >
      <option value="all">
        全部来源状态
      </option>
      <option value="differences">
        仅看差异
      </option>
      <option v-for="(label, key) in CHANGES" :key="key" :value="key">
        {{ label }}
      </option>
    </select>
  </div>
  <select
    v-if="display !== 'issues'"
    :value="modelValue.condition" class="select select-sm w-full"
    aria-label="SEO 字段情况"
    @change="update('condition', $event)"
  >
    <option value="all">
      全部字段情况
    </option>
    <option value="empty">
      DOM 空值
    </option>
    <option value="missing">
      DOM 未发现
    </option>
    <option value="multiple">
      DOM 多值／重复
    </option>
  </select>
  <select
    v-else
    :value="modelValue.severity" class="select select-sm w-full"
    aria-label="SEO 问题等级"
    @change="update('severity', $event)"
  >
    <option value="all">
      全部问题与提示
    </option>
    <option value="problem">
      问题
    </option>
    <option value="review">
      需要核对
    </option>
    <option value="info">
      信息
    </option>
  </select>
</template>
