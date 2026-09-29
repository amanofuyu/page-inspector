<script setup lang="ts">
import { Tooltip } from '@ark-ui/vue/tooltip'
import { onMounted, ref, shallowRef } from 'vue'

defineProps<{ content: string, disabled?: boolean }>()
const trigger = ref<InstanceType<typeof Tooltip.Trigger> | null>(null)
const target = shallowRef<HTMLElement | string>('body')
onMounted(() => {
  // 原生 dialog 位于顶层，内部提示也必须留在该顶层才能被看见。
  const element = trigger.value?.$el
  if (element instanceof HTMLElement)
    target.value = element.closest('dialog') ?? 'body'
})
</script>

<template>
  <Tooltip.Root :disabled="disabled || !content" :open-delay="400" :close-delay="100" :positioning="{ placement: 'top', gutter: 8 }" lazy-mount unmount-on-exit>
    <Tooltip.Trigger ref="trigger" as-child>
      <slot />
    </Tooltip.Trigger>
    <Teleport :to="target">
      <Tooltip.Positioner>
        <Tooltip.Content class="ui-tooltip">
          {{ content }}
        </Tooltip.Content>
      </Tooltip.Positioner>
    </Teleport>
  </Tooltip.Root>
</template>
