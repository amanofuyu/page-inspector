<script setup lang="ts">
import type { StyleValue } from 'vue'
import { Check } from '@lucide/vue'
import { useAttrs } from 'vue'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ modelValue: boolean, disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const attrs = useAttrs()
function inputAttrs() {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
}
function change(event: Event) {
  if (!props.disabled)
    emit('update:modelValue', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <label class="ui-checkbox" :class="attrs.class" :style="attrs.style as StyleValue" :data-disabled="disabled || undefined">
    <span class="ui-checkbox-box">
      <input v-bind="inputAttrs()" type="checkbox" :checked="modelValue" :disabled="disabled" @change="change">
      <span class="ui-checkbox-control" aria-hidden="true"><Check :size="12" :stroke-width="2.5" /></span>
    </span>
    <span class="ui-checkbox-label"><slot /></span>
  </label>
</template>
