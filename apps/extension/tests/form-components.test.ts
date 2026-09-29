// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import UiCheckbox from '../components/ui/UiCheckbox.vue'
import UiInput from '../components/ui/UiInput.vue'
import UiSearchInput from '../components/ui/UiSearchInput.vue'
import WatchButton from '../features/inspector/WatchButton.vue'
import WatchView from '../features/watch/WatchView.vue'

const mounted: ReturnType<typeof mount>[] = []
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

describe('统一表单的输入与提交行为', () => {
  it('输入法候选期间不更新模型，完成组词后更新，change 才提交', async () => {
    const wrapper = mount(UiInput, { props: { label: '关注别名', modelValue: '' }, attrs: { 'id': 'alias', 'name': 'alias', 'aria-describedby': 'alias-help', 'maxlength': 160 } })
    mounted.push(wrapper)
    const input = wrapper.get('input')
    expect(input.attributes()).toMatchObject({ 'id': 'alias', 'name': 'alias', 'aria-describedby': 'alias-help', 'maxlength': '160' })
    expect(wrapper.attributes('id')).toBeUndefined()
    await input.trigger('compositionstart')
    input.element.value = '关注'
    await input.trigger('input')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await input.trigger('compositionend')
    expect(wrapper.emitted('update:modelValue')).toEqual([['关注']])
    expect(wrapper.emitted('change')).toBeUndefined()
    await input.trigger('change')
    expect(wrapper.emitted('change')).toEqual([['关注']])
    await wrapper.setProps({ modelValue: '来自父级的新名称', invalid: true })
    expect(input.element.value).toBe('来自父级的新名称')
    expect(input.attributes('aria-invalid')).toBe('true')
  })

  it('只读和禁用输入不发出编辑或提交事件', async () => {
    const wrapper = mount(UiInput, { props: { label: '路径', modelValue: 'data', readonly: true, clearable: true } })
    mounted.push(wrapper)
    expect(wrapper.find('button').exists()).toBe(false)
    await wrapper.get('input').setValue('尝试修改')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('change')).toBeUndefined()
    await wrapper.setProps({ readonly: false, disabled: true })
    await wrapper.get('input').setValue('禁用期间修改')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('input').element.disabled).toBe(true)
  })

  it('搜索框清空后更新筛选并把焦点还给输入框', async () => {
    const value = ref('products')
    const wrapper = mount(defineComponent({
      components: { UiSearchInput },
      setup: () => ({ value }),
      template: '<UiSearchInput v-model="value" label="搜索字段" />',
    }), { attachTo: document.body })
    mounted.push(wrapper)
    const input = wrapper.get('input')
    await wrapper.get('[aria-label="清空搜索字段"]').trigger('click')
    expect(value.value).toBe('')
    expect(input.element.value).toBe('')
    expect(document.activeElement).toBe(input.element)
    expect(wrapper.find('button').exists()).toBe(false)
    await input.setValue('state')
    expect(value.value).toBe('state')
    expect(wrapper.find('[aria-label="清空搜索字段"]').exists()).toBe(true)
  })

  it('复选框点击整段标签更新布尔值，禁用后阻止再次切换', async () => {
    const checked = ref(false)
    const disabled = ref(false)
    const wrapper = mount(defineComponent({
      components: { UiCheckbox },
      setup: () => ({ checked, disabled }),
      template: '<UiCheckbox v-model="checked" :disabled="disabled" name="preserve">保留导航前记录</UiCheckbox>',
    }), { attachTo: document.body })
    mounted.push(wrapper)
    wrapper.get('label').element.click()
    await nextTick()
    expect(checked.value).toBe(true)
    expect(wrapper.get('input').element.checked).toBe(true)
    expect(wrapper.get('input').attributes('name')).toBe('preserve')
    disabled.value = true
    await nextTick()
    wrapper.get('label').element.click()
    await nextTick()
    expect(checked.value).toBe(true)
    expect(wrapper.getComponent(UiCheckbox).emitted('update:modelValue')).toEqual([[true]])
  })

  it('关注编辑保留草稿更新与重命名提交的区别，不修改父级对象', async () => {
    const draft = { path: '', name: '', includeQuery: false }
    const scope = { origin: 'https://example.com', pathname: '/', app: 'nuxt', query: null }
    const rule = { id: 'watch-1', kind: 'watch' as const, version: 1 as const, name: '价格', createdAt: 1, scope, path: [] }
    const wrapper = mount(WatchView, { props: { draft, scope, watches: [rule], otherWatches: [], comparisons: [] } })
    mounted.push(wrapper)
    const input = wrapper.get<HTMLInputElement>('[aria-label="重命名关注 价格"]')
    input.element.value = '商品价格'
    await input.trigger('input')
    expect(wrapper.emitted('rename')).toBeUndefined()
    await input.trigger('change')
    expect(wrapper.emitted('rename')).toEqual([['watch-1', '商品价格']])
    expect(rule.name).toBe('价格')
    await wrapper.get('[aria-label="关注别名"]').setValue('新关注')
    expect(wrapper.emitted('update:draft')).toEqual([[{ ...draft, name: '新关注' }]])
    expect(draft.name).toBe('')
  })

  it('关注按钮共用操作反馈并保留选中与忙碌语义', async () => {
    const wrapper = mount(WatchButton, { props: { path: [], watched: false } })
    mounted.push(wrapper)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('toggle')).toEqual([[[]]])
    await wrapper.setProps({ watched: true, busy: true })
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('button').attributes('aria-busy')).toBe('true')
    expect(wrapper.text()).toContain('处理中')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })
})
