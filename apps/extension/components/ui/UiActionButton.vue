<script setup lang="ts">
import { motion } from 'motion-v'
import { useMotionPreferences } from '@/libs/motion'
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
const { reduced, transition } = useMotionPreferences()
</script>

<template>
  <UiTooltip :content="tooltip || label || ''" :disabled="busy || disabled">
    <motion.button
      v-bind="$attrs" type="button" class="btn" :class="[`btn-${size}`, `btn-${variant}`, { 'icon-button': iconOnly }]"
      :aria-label="label" :aria-busy="busy || undefined" :disabled="busy || disabled"
      :while-press="reduced || busy || disabled ? undefined : { scale: 0.96 }" :transition="transition"
      @click="emit('click', $event)"
    >
      <slot />
    </motion.button>
  </UiTooltip>
</template>
