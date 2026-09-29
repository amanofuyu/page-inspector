// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import ThemeController from '../components/theme-controller.vue'
import UiSelect from '../components/ui/UiSelect.vue'
import UiTooltip from '../components/ui/UiTooltip.vue'

const theme = ref<'auto' | 'light' | 'dark'>('auto')
vi.mock('../composables/useTheme', () => ({ useTheme: () => ({ colorMode: theme }) }))
const mounted: ReturnType<typeof mount>[] = []
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  theme.value = 'auto'
})
function render(component: Parameters<typeof mount>[0], options: Parameters<typeof mount>[1] = {}) {
  const wrapper = mount(component, { attachTo: document.body, ...options })
  mounted.push(wrapper)
  return wrapper
}
async function open(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[role="combobox"]').trigger('click')
  await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull())
  await vi.waitFor(() => expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('true'))
  expect(wrapper.get('[role="combobox"]').attributes('data-state')).toBe('open')
  expect(wrapper.get('[role="combobox"]').attributes('data-scope')).toBe('select')
}
async function choose(value: string) {
  document.querySelector<HTMLElement>(`[role="option"][data-option-value="${value}"]`)!.click()
  await nextTick()
}

describe('统一下拉选择', () => {
  it('数字和空值保持原类型，只有父级接受更新后才改变显示', async () => {
    const wrapper = mount(UiSelect, { attachTo: document.body, props: { modelValue: null, label: '分析来源', items: [{ value: null, label: '合并应用' }, { value: 0, label: '来源一' }, { value: 1, label: '来源二', disabled: true }] } })
    mounted.push(wrapper)
    await open(wrapper)
    await choose('1')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await choose('0')
    await vi.waitFor(() => expect(wrapper.emitted('update:modelValue')).toEqual([[0]]))
    expect(wrapper.get('[role="combobox"]').text()).toContain('合并应用')
    await wrapper.setProps({ modelValue: 0 })
    await vi.waitFor(() => expect(wrapper.get('[role="combobox"]').text()).toContain('来源一'))
    await open(wrapper)
    await choose('null')
    await vi.waitFor(() => expect(wrapper.emitted('update:modelValue')).toEqual([[0], [null]]))
  })

  it('键盘导航跳过禁用项，Escape 关闭并恢复触发按钮焦点', async () => {
    const wrapper = render(UiSelect, { props: { modelValue: 'a', label: '排序', items: [{ value: 'a', label: '体积' }, { value: 'b', label: '禁用', disabled: true }, { value: 'c', label: '路径' }] } })
    const trigger = wrapper.get('[role="combobox"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await vi.waitFor(() => expect(trigger.attributes('aria-expanded')).toBe('true'))
    const content = document.querySelector<HTMLElement>('[role="listbox"]')!
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await vi.waitFor(() => expect(content.querySelector('[data-highlighted]')?.getAttribute('data-option-value')).toBe('c'))
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.waitFor(() => expect(trigger.attributes('aria-expanded')).toBe('false'))
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger.element))
  })

  it('主题入口与菜单共用组件，保留紧凑图标并正确更新主题', async () => {
    const wrapper = render(ThemeController, { props: { compact: true } })
    expect(wrapper.find('.ui-select-icon-only').exists()).toBe(true)
    expect(wrapper.getComponent(UiTooltip).props('content')).toBe('界面主题：跟随系统')
    expect(wrapper.get('[role="combobox"]').attributes('title')).toBeUndefined()
    ;(wrapper.get('[role="combobox"]').element as HTMLElement).focus()
    await vi.waitFor(() => expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('界面主题：跟随系统'))
    await open(wrapper)
    await vi.waitFor(() => expect(document.querySelector('[role="tooltip"]')).toBeNull())
    expect(document.querySelectorAll('.ui-select-item')).toHaveLength(3)
    await choose('dark')
    await vi.waitFor(() => expect(theme.value).toBe('dark'))
    expect(wrapper.getComponent(UiTooltip).props('content')).toBe('界面主题：深色')
  })

  it('禁用状态阻止打开，弹窗内菜单保留在同一原生顶层', async () => {
    const wrapper = render(defineComponent({
      components: { UiSelect },
      setup: () => ({ disabled: ref(true) }),
      template: '<dialog open><UiSelect model-value="a" label="弹窗选择" :disabled="disabled" :items="[{ value: \'a\', label: \'选项\' }]" /><button @click="disabled = false">启用</button></dialog>',
    }))
    expect(wrapper.get('[role="combobox"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[role="combobox"]').trigger('click')
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    await wrapper.get('dialog > button').trigger('click')
    await open(wrapper)
    expect(wrapper.find('dialog [role="listbox"]').exists()).toBe(true)
  })

  it('工作区进入 KeepAlive 缓存时关闭传送到 body 的菜单', async () => {
    const visible = ref(true)
    const wrapper = render(defineComponent({
      components: { UiSelect },
      setup: () => ({ visible }),
      template: '<KeepAlive><UiSelect v-if="visible" model-value="a" label="缓存选择" :items="[{ value: \'a\', label: \'选项\' }]" /></KeepAlive>',
    }))
    await open(wrapper)
    visible.value = false
    await nextTick()
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).toBeNull())
    visible.value = true
    await nextTick()
    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('false')
  })
})
