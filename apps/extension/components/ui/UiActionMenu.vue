<script setup lang="ts" generic="T extends string">
import type { UiMenuItem } from './menu'
import { Menu } from '@ark-ui/vue/menu'
import { computed, onDeactivated, onMounted, ref, shallowRef, watch } from 'vue'
import UiPresence from './UiPresence.vue'

const props = withDefaults(defineProps<{
  label: string
  menuLabel?: string
  items: readonly UiMenuItem<T>[]
  active?: boolean
}>(), { active: true })
const emit = defineEmits<{ select: [value: T] }>()
const open = ref(false)
const trigger = ref<InstanceType<typeof Menu.Trigger> | null>(null)
const target = shallowRef<HTMLElement | string>('body')
const unavailable = computed(() => !props.active || !props.items.some(item => !item.disabled))
function select({ value }: { value: string }) {
  const item = props.items.find(item => item.value === value && !item.disabled)
  if (!unavailable.value && item)
    emit('select', item.value)
}
onMounted(() => {
  // 弹窗内保留原生顶层，其余菜单传送到 body，避免被滚动区域裁切。
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
  <span class="ui-action-menu">
    <Menu.Root
      v-model:open="open" lazy-mount unmount-on-exit
      :positioning="{ placement: 'bottom-end', strategy: 'fixed', gutter: 6, fitViewport: true, slide: true, hideWhenDetached: true }"
      @select="select"
    >
      <Menu.Trigger ref="trigger" class="ui-menu-trigger" :aria-label="label" :disabled="unavailable">
        <slot />
      </Menu.Trigger>
      <Teleport :to="target">
        <Menu.Positioner class="ui-menu-positioner">
          <UiPresence preset="dropdown">
            <Menu.Content v-if="open" class="ui-menu-content" :aria-label="menuLabel ?? label">
              <template v-for="item in items" :key="item.value">
                <Menu.Separator v-if="item.separatorBefore" class="ui-menu-separator" />
                <Menu.Item :value="item.value" :disabled="item.disabled" class="ui-menu-item">
                  <component :is="item.icon" v-if="item.icon" :size="14" aria-hidden="true" />
                  {{ item.label }}
                </Menu.Item>
              </template>
            </Menu.Content>
          </UiPresence>
        </Menu.Positioner>
      </Teleport>
    </Menu.Root>
  </span>
</template>
