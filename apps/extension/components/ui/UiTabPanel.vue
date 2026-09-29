<script setup lang="ts">
import type { UiAnimation } from '@/libs/motion'
import { Tabs } from '@ark-ui/vue/tabs'
import { onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { animateUi } from '@/libs/motion'
import { useTabItems } from './tabs-context'

const props = defineProps<{ value: string }>()
const panel = ref<InstanceType<typeof Tabs.Content> | null>(null)
const items = useTabItems()
let animation: UiAnimation | undefined

// 保持插槽实例和业务会话，只为更新后的面板添加有方向的入场过渡。
watch(() => props.value, (value, previous) => {
  animation?.cancel()
  const element = panel.value?.$el
  if (!(element instanceof HTMLElement))
    return
  const direction = items.value.findIndex(item => item.id === value) >= items.value.findIndex(item => item.id === previous) ? 1 : -1
  animation = animateUi(element, { opacity: [0, 1], transform: [`translateX(${direction * 12}px)`, 'translateX(0px)'] })
}, { flush: 'post' })
onBeforeUnmount(() => animation?.cancel())
onDeactivated(() => animation?.cancel())
</script>

<template>
  <Tabs.Content ref="panel" :value="value" as-child>
    <slot />
  </Tabs.Content>
</template>
