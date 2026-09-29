<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { ark } from '@ark-ui/vue/factory'
import { Tooltip } from '@ark-ui/vue/tooltip'
import { onActivated, onDeactivated, onMounted, ref, shallowRef, watch } from 'vue'
import UiPresence from './UiPresence.vue'

const props = defineProps<{ content: string, disabled?: boolean, triggerId?: string }>()
const open = ref(false)
const active = ref(true)
const trigger = ref<{ $el: HTMLElement } | null>(null)
const target = shallowRef<HTMLElement | string>('body')
function triggerProps(attributes: HTMLAttributes) {
  // 提示只附加标识、描述和事件，保留下拉框、分栏等宿主自己的状态与归属标记。
  return Object.fromEntries(Object.entries(attributes).filter(([key]) => !key.startsWith('data-')))
}
onMounted(() => {
  // 原生 dialog 位于顶层，内部提示也必须留在该顶层才能被看见。
  const element = trigger.value?.$el
  if (element instanceof HTMLElement)
    target.value = element.closest('dialog') ?? 'body'
})
watch(() => props.disabled || !props.content, (disabled) => {
  if (disabled)
    open.value = false
})
onDeactivated(() => {
  active.value = false
  open.value = false
})
onActivated(() => {
  active.value = true
})
</script>

<template>
  <Tooltip.Root v-model:open="open" :ids="triggerId ? { trigger: triggerId } : undefined" :disabled="disabled || !content || !active" :open-delay="400" :close-delay="100" :positioning="{ placement: 'top', strategy: 'fixed', gutter: 8, fitViewport: true, hideWhenDetached: true }">
    <Tooltip.Context v-slot="tooltip">
      <ark.span ref="trigger" as-child v-bind="triggerProps(tooltip.getTriggerProps())">
        <slot />
      </ark.span>
    </Tooltip.Context>
    <Teleport :to="target">
      <Tooltip.Positioner>
        <UiPresence preset="fade">
          <Tooltip.Content v-if="open" class="ui-tooltip" :hidden="false">
            {{ content }}
          </Tooltip.Content>
        </UiPresence>
      </Tooltip.Positioner>
    </Teleport>
  </Tooltip.Root>
</template>
