<script setup lang="ts">
import type { StyleValue } from 'vue'
import { X } from '@lucide/vue'
import { computed, ref, useAttrs } from 'vue'
import UiActionButton from './UiActionButton.vue'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{
  modelValue?: string
  label: string
  type?: 'text' | 'search'
  disabled?: boolean
  readonly?: boolean
  invalid?: boolean
  clearable?: boolean
}>(), { modelValue: '', type: 'text' })
const emit = defineEmits<{ 'update:modelValue': [value: string], 'change': [value: string] }>()
const attrs = useAttrs()
const input = ref<HTMLInputElement | null>(null)
const value = computed({
  get: () => props.modelValue,
  set: (value: string) => {
    if (!props.disabled && !props.readonly)
      emit('update:modelValue', value)
  },
})
// 布局属性留在外壳，名称、描述、表单属性和键盘事件透传给原生输入框。
function inputAttrs() {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
}
function commit(event: Event) {
  if (!props.disabled && !props.readonly)
    emit('change', (event.target as HTMLInputElement).value)
}
function clear() {
  if (props.disabled || props.readonly)
    return
  emit('update:modelValue', '')
  emit('change', '')
  input.value?.focus()
}
defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="ui-input" :class="attrs.class" :style="attrs.style as StyleValue" :data-disabled="disabled || undefined" :data-invalid="invalid || undefined">
    <span v-if="$slots.leading" class="ui-input-leading" aria-hidden="true"><slot name="leading" /></span>
    <input
      v-bind="inputAttrs()" ref="input" v-model="value" :type="type" :aria-label="label"
      :disabled="disabled" :readonly="readonly" :aria-invalid="invalid || undefined"
      @change="commit"
    >
    <UiActionButton v-if="clearable && modelValue && !readonly" class="ui-input-clear" icon-only :label="`清空${label}`" :disabled="disabled" @click="clear">
      <X :size="13" aria-hidden="true" />
    </UiActionButton>
  </div>
</template>
