<script setup lang="ts">
import UiTooltip from './UiTooltip.vue'

defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{
  label?: string
  tooltip?: string
  busy?: boolean
  disabled?: boolean
  size?: 'xs' | 'sm'
  variant?: 'ghost' | 'primary'
  iconOnly?: boolean
}>(), { size: 'xs', variant: 'ghost' })
const emit = defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <UiTooltip :content="tooltip || label || ''" :disabled="busy || disabled">
    <button
      v-bind="$attrs" type="button" class="btn" :class="[`btn-${size}`, `btn-${variant}`, { 'icon-button': iconOnly }]"
      :aria-label="label" :aria-busy="busy || undefined" :disabled="busy || disabled"
      @click="emit('click', $event)"
    >
      <slot />
    </button>
  </UiTooltip>
</template>
