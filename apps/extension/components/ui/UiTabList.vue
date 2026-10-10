<script setup lang="ts">
import { Tabs } from '@ark-ui/vue/tabs'
import { nextTick, onMounted, ref, watch } from 'vue'
import { useTabItems, useTabValue } from './tabs-context'

withDefaults(defineProps<{ label: string, variant?: 'view' | 'workspace' }>(), { variant: 'view' })
const items = useTabItems()
const value = useTabValue()
const list = ref<InstanceType<typeof Tabs.List> | null>(null)

// 横向导航在重建或切换后显示选中项，只移动自身，不改变工作区的纵向滚动。
function revealSelected() {
  const element = list.value?.$el
  if (!(element instanceof HTMLElement) || element.scrollWidth <= element.clientWidth)
    return
  const selected = element.querySelector<HTMLElement>('[role="tab"][data-selected]')
  if (!selected)
    return
  const bounds = element.getBoundingClientRect()
  const item = selected.getBoundingClientRect()
  if (item.right > bounds.right)
    element.scrollLeft += item.right - bounds.right
  else if (item.left < bounds.left)
    element.scrollLeft -= bounds.left - item.left
}
onMounted(revealSelected)
watch(value, () => nextTick(revealSelected), { flush: 'post' })
</script>

<template>
  <Tabs.List ref="list" :aria-label="label" class="ui-tab-list" :class="variant === 'workspace' ? 'workspace-tabs' : 'view-tabs'">
    <Tabs.Trigger v-for="item in items" :key="item.id" :value="item.id" :disabled="item.disabled">
      <span v-if="item.id === value" class="ui-tab-indicator" aria-hidden="true" />
      <component :is="item.icon" v-if="item.icon" :size="16" aria-hidden="true" />
      <span>{{ item.label }}</span>
    </Tabs.Trigger>
  </Tabs.List>
</template>
