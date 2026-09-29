<script setup lang="ts" generic="T extends UiSelectValue">
import type { UiSelectItem, UiSelectValue } from './select'
import { createListCollection, Select } from '@ark-ui/vue/select'
import { Check, ChevronDown } from '@lucide/vue'
import { computed, onDeactivated, onMounted, ref, shallowRef, useId, watch } from 'vue'
import { selectItemKey } from './select'
import UiPresence from './UiPresence.vue'
import UiTooltip from './UiTooltip.vue'

const props = withDefaults(defineProps<{
  modelValue: T
  items: readonly UiSelectItem<T>[]
  label: string
  disabled?: boolean
  iconOnly?: boolean
  size?: 'xs' | 'sm'
  placeholder?: string
}>(), { size: 'sm', placeholder: '请选择' })
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
const open = ref(false)
// Tooltip 和 Select 共用真实按钮标识，避免浮层关闭后丢失焦点目标。
const triggerId = `ui-select-${useId()}-trigger`
const trigger = ref<InstanceType<typeof Select.Trigger> | null>(null)
const target = shallowRef<HTMLElement | string>('body')
const collection = computed(() => createListCollection({
  items: [...props.items],
  itemToValue: item => selectItemKey(item.value),
  itemToString: item => item.label,
  isItemDisabled: item => !!item.disabled,
}))
const selected = computed(() => props.items.find(item => Object.is(item.value, props.modelValue)))
const value = computed(() => selected.value ? [selectItemKey(selected.value.value)] : [])
const unavailable = computed(() => props.disabled || !props.items.some(item => !item.disabled))

function select(values: string[]) {
  const item = props.items.find(item => selectItemKey(item.value) === values[0] && !item.disabled)
  if (!unavailable.value && item && !Object.is(item.value, props.modelValue))
    emit('update:modelValue', item.value)
}
onMounted(() => {
  // 弹窗内的菜单保留在原生顶层，其余菜单传送到 body，避免被滚动面板裁切。
  const element = trigger.value?.$el
  if (element instanceof HTMLElement)
    target.value = element.closest('dialog') ?? 'body'
})
watch(unavailable, (disabled) => {
  if (disabled)
    open.value = false
})
onDeactivated(() => {
  open.value = false
})
</script>

<template>
  <Select.Root
    v-model:open="open" :model-value="value" :collection="collection" :disabled="unavailable" :ids="{ trigger: triggerId }"
    class="ui-select" :class="{ 'ui-select-icon-only': iconOnly }" :data-size="size"
    :positioning="{ placement: 'bottom-start', strategy: 'fixed', gutter: 6, sameWidth: !iconOnly, fitViewport: true, slide: true, hideWhenDetached: true }"
    @update:model-value="select"
  >
    <Select.Label class="sr-only">
      {{ label }}
    </Select.Label>
    <Select.Control>
      <UiTooltip :trigger-id="triggerId" :content="iconOnly ? `${label}：${selected?.label ?? placeholder}` : ''" :disabled="open || unavailable">
        <Select.Trigger ref="trigger" class="ui-select-trigger" :aria-label="label" :data-value="String(modelValue)">
          <component :is="selected.icon" v-if="selected?.icon" :size="14" class="ui-select-icon" aria-hidden="true" />
          <Select.ValueText v-if="!iconOnly" class="ui-select-value" :placeholder="placeholder" />
          <Select.Indicator v-if="!iconOnly" class="ui-select-indicator">
            <ChevronDown :size="14" aria-hidden="true" />
          </Select.Indicator>
        </Select.Trigger>
      </UiTooltip>
    </Select.Control>
    <Teleport :to="target">
      <Select.Positioner class="ui-select-positioner">
        <UiPresence preset="dropdown">
          <Select.Content v-if="open" class="ui-select-content" :hidden="false" :aria-label="label">
            <Select.Item v-for="item in items" :key="selectItemKey(item.value)" :item="item" class="ui-select-item" :data-option-value="String(item.value)">
              <component :is="item.icon" v-if="item.icon" :size="14" class="ui-select-icon" aria-hidden="true" />
              <Select.ItemText class="ui-select-item-text">
                {{ item.label }}
              </Select.ItemText>
              <Select.ItemIndicator class="ui-select-check">
                <Check :size="14" aria-hidden="true" />
              </Select.ItemIndicator>
            </Select.Item>
          </Select.Content>
        </UiPresence>
      </Select.Positioner>
    </Teleport>
    <Select.HiddenSelect />
  </Select.Root>
</template>
