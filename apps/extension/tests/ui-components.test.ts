// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import UiActionButton from '../components/ui/UiActionButton.vue'
import UiDisclosure from '../components/ui/UiDisclosure.vue'
import UiTabList from '../components/ui/UiTabList.vue'
import UiTabPanel from '../components/ui/UiTabPanel.vue'
import UiTabs from '../components/ui/UiTabs.vue'

const mounted: ReturnType<typeof mount>[] = []
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})
function render(component: Parameters<typeof mount>[0], options: Parameters<typeof mount>[1] = {}) {
  const wrapper = mount(component, { attachTo: document.body, ...options })
  mounted.push(wrapper)
  return wrapper
}

describe('公共交互组件', () => {
  it('方向键跳过禁用页签，只移动焦点；确认后才更新受控值和面板关联', async () => {
    const value = ref('first')
    const wrapper = render(defineComponent({
      components: { UiTabs, UiTabList, UiTabPanel },
      setup: () => ({ value, items: [{ id: 'first', label: '数据' }, { id: 'disabled', label: '不可用', disabled: true }, { id: 'last', label: '状态' }] }),
      template: '<UiTabs v-model="value" :items="items"><section><UiTabList label="分类" /><UiTabPanel :value="value"><div><input aria-label="保留的输入" /></div></UiTabPanel></section></UiTabs>',
    }))
    const tabs = wrapper.findAll('[role="tab"]')
    const first = tabs[0]!
    const last = tabs[2]!
    const input = wrapper.get('input').element
    ;(first.element as HTMLElement).focus()
    await first.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    await vi.waitFor(() => expect(document.activeElement).toBe(last.element))
    expect(value.value).toBe('first')
    await last.trigger('keydown', { key: 'Enter' })
    // DOM 模拟环境不会合成原生按钮的键盘点击，显式补上浏览器默认激活。
    await last.trigger('click')
    await nextTick()
    await vi.waitFor(() => expect(value.value).toBe('last'))
    await vi.waitFor(() => expect(last.attributes('aria-selected')).toBe('true'))
    expect(wrapper.get('[role="tabpanel"]').attributes('aria-labelledby')).toBe(last.attributes('id'))
    expect(last.attributes('aria-controls')).toBe(wrapper.get('[role="tabpanel"]').attributes('id'))
    expect(wrapper.get('input').element).toBe(input)
    value.value = 'first'
    await nextTick()
    await vi.waitFor(() => expect(first.attributes('aria-selected')).toBe('true'))
  })

  it('展示组件只发出选择意图，父级未接受时保持原选中值', async () => {
    const wrapper = render(defineComponent({
      components: { UiTabs, UiTabList },
      template: '<UiTabs model-value="first" :items="[{ id: \'first\', label: \'数据\' }, { id: \'last\', label: \'原文\' }]"><div><UiTabList label="分类" /></div></UiTabs>',
    }))
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click')
    expect(wrapper.getComponent(UiTabs).emitted('update:modelValue')).toEqual([['last']])
    expect(wrapper.findAll('[role="tab"]')[0]!.attributes('aria-selected')).toBe('true')
  })

  it('操作按钮透传事件与无障碍属性，业务忙碌时阻止再次触发', async () => {
    const wrapper = mount(UiActionButton, { attachTo: document.body, props: { label: '重新读取', iconOnly: true }, attrs: { 'aria-controls': 'report' }, slots: { default: '读取' } })
    mounted.push(wrapper)
    expect(wrapper.get('button').attributes('aria-controls')).toBe('report')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
    await wrapper.setProps({ busy: true })
    expect(wrapper.get('button').attributes('aria-busy')).toBe('true')
    expect((wrapper.get('button').element as HTMLButtonElement).disabled).toBe(true)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('键盘聚焦显示统一提示，Escape 关闭后保留按钮焦点', async () => {
    const wrapper = render(UiActionButton, { props: { label: '查看来源', tooltip: '查看页面与采集来源' }, slots: { default: '来源' } })
    const button = wrapper.get('button').element as HTMLButtonElement
    button.focus()
    await vi.waitFor(() => expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('查看页面与采集来源'))
    expect(button.getAttribute('aria-describedby')).toBe(document.querySelector('[role="tooltip"]')?.id)
    await wrapper.get('button').trigger('keydown', { key: 'Escape' })
    await vi.waitFor(() => expect(document.querySelector('[role="tooltip"]')).toBeNull())
    expect(document.activeElement).toBe(button)
  })

  it('折叠状态由父级控制，关闭后详情不再保留可交互元素', async () => {
    const open = ref(false)
    const wrapper = render(defineComponent({
      components: { UiDisclosure },
      setup: () => ({ open }),
      template: '<UiDisclosure v-model:open="open" label="来源"><button>复制来源</button></UiDisclosure>',
    }))
    const trigger = wrapper.get('.ui-disclosure-trigger')
    await trigger.trigger('click')
    await nextTick()
    expect(open.value).toBe(true)
    expect(trigger.attributes('aria-controls')).toBe(wrapper.get('.ui-disclosure-content').attributes('id'))
    expect(wrapper.text()).toContain('复制来源')
    open.value = false
    await nextTick()
    await vi.waitFor(() => expect(trigger.attributes('aria-expanded')).toBe('false'))
    await vi.waitFor(() => expect(wrapper.find('.ui-disclosure-content button').exists()).toBe(false))
  })

  it('原生弹窗内部提示保留在最近的 dialog 内，避免被顶层遮挡', async () => {
    const wrapper = render(defineComponent({
      components: { UiActionButton },
      template: '<dialog open><UiActionButton label="关闭" tooltip="关闭页面信息">关闭</UiActionButton></dialog>',
    }))
    ;(wrapper.get('button').element as HTMLButtonElement).focus()
    await vi.waitFor(() => expect(wrapper.find('dialog [role="tooltip"]').exists()).toBe(true))
  })
})
