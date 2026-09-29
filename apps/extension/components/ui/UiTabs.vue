<script setup lang="ts" generic="T extends string">
import type { UiTabItem } from './tabs-context'
import { Tabs } from '@ark-ui/vue/tabs'
import { computed, provide } from 'vue'
import { tabsItemsKey } from './tabs-context'

const props = defineProps<{ modelValue: T, items: readonly UiTabItem<T>[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
provide(tabsItemsKey, computed(() => props.items))

// 选中值由容器持有；组件只校验并上报操作，不复制业务状态。
function select(value: string) {
  const item = props.items.find(item => item.id === value && !item.disabled)
  if (item && item.id !== props.modelValue)
    emit('update:modelValue', item.id)
}
</script>

<template>
  <Tabs.Root :model-value="modelValue" activation-mode="manual" loop-focus as-child @update:model-value="select">
    <slot />
  </Tabs.Root>
</template>
