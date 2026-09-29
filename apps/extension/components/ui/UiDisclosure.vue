<script setup lang="ts">
import { Collapsible } from '@ark-ui/vue/collapsible'
import { ChevronRight } from '@lucide/vue'
import UiPresence from './UiPresence.vue'

defineProps<{ label?: string }>()
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <Collapsible.Root v-model:open="open" class="ui-disclosure">
    <Collapsible.Trigger class="ui-disclosure-trigger">
      <ChevronRight class="disclosure-chevron" :size="14" aria-hidden="true" />
      <slot name="label">
        {{ label }}
      </slot>
    </Collapsible.Trigger>
    <slot name="preview" />
    <Collapsible.Content class="ui-disclosure-content" :hidden="false">
      <UiPresence>
        <div v-if="open">
          <slot />
        </div>
      </UiPresence>
    </Collapsible.Content>
  </Collapsible.Root>
</template>
