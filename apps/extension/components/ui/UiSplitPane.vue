<script setup lang="ts">
import type { UiSplitPaneSize } from './split-pane'
import { Splitter, useSplitter } from '@ark-ui/vue/splitter'
import { useElementSize } from '@vueuse/core'
import { computed, nextTick, useTemplateRef, watch } from 'vue'

const props = withDefaults(defineProps<{
  label: string
  secondaryVisible: boolean
  stackBelow?: number
}>(), { stackBelow: 600 })
const model = defineModel<UiSplitPaneSize>({ required: true })
const container = useTemplateRef<HTMLElement>('container')
const { width, height } = useElementSize(container)
const orientation = computed(() => width.value < props.stackBelow ? 'vertical' : 'horizontal')
// 尺寸约束只影响当前布局，不把窗口缩小后的临时限制写回偏好。
const minimum = computed(() => {
  const horizontal = orientation.value === 'horizontal'
  const available = horizontal ? width.value : height.value
  return Math.min(45, Math.max(20, (horizontal ? 180 : 80) / Math.max(available, 1) * 100))
})
const panels = computed(() => props.secondaryVisible
  ? [{ id: 'primary', minSize: minimum.value }, { id: 'secondary', minSize: minimum.value }]
  : [{ id: 'primary' }])
const size = computed(() => {
  if (!props.secondaryVisible)
    return [100]
  const primary = Math.min(100 - minimum.value, Math.max(minimum.value, model.value[orientation.value]))
  return [primary, 100 - primary]
})
let synchronizing = false
let resizing: 'horizontal' | 'vertical' | undefined
const splitter = useSplitter(computed(() => ({
  panels: panels.value,
  orientation: orientation.value,
  defaultSize: size.value,
  onResizeStart() {
    if (!synchronizing)
      resizing = orientation.value
  },
  onResizeEnd({ size }) {
    if (!synchronizing) {
      if (resizing === orientation.value)
        resize(size)
      resizing = undefined
    }
  },
  onResize({ size }) {
    if (!synchronizing && resizing === orientation.value)
      resize(size)
  },
})))

// Ark 自动缩放会沿用旧方向的布局；用公开 API 应用受控偏好，保留插槽实例。
// 测量、约束和外部更新均不能伪装成用户拖动，写回父级模型。
watch([size, width, height], async (_value, _old, onCleanup) => {
  let current = true
  onCleanup(() => {
    current = false
  })
  await nextTick()
  if (!current)
    return
  synchronizing = true
  splitter.value.setSizes(size.value)
  await nextTick()
  synchronizing = false
}, { flush: 'post' })

function resize(sizes: number[]) {
  if (props.secondaryVisible && sizes.length === 2 && Number.isFinite(sizes[0]))
    model.value = { ...model.value, [orientation.value]: sizes[0] }
}
</script>

<template>
  <div ref="container" class="ui-split-pane">
    <Splitter.RootProvider :value="splitter">
      <Splitter.Panel id="primary" class="ui-split-panel">
        <slot />
      </Splitter.Panel>
      <template v-if="secondaryVisible">
        <Splitter.ResizeTrigger
          id="primary:secondary"
          class="ui-split-handle"
          :aria-label="label"
          :aria-orientation="orientation === 'horizontal' ? 'vertical' : 'horizontal'"
          :aria-valuetext="`主面板 ${Math.round(size[0]!)}%`"
          :title="`${label}：拖动或使用${orientation === 'horizontal' ? '左右' : '上下'}方向键调整`"
        >
          <Splitter.ResizeTriggerIndicator class="ui-split-indicator" />
        </Splitter.ResizeTrigger>
        <Splitter.Panel id="secondary" class="ui-split-panel">
          <slot name="secondary" />
        </Splitter.Panel>
      </template>
    </Splitter.RootProvider>
  </div>
</template>
