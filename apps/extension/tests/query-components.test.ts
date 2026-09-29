// @vitest-environment happy-dom
import type { QuerySpec } from '../features/query/engine'
import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import QueryConditionEditor from '../features/query/components/QueryConditionEditor.vue'

it('查询表单替换嵌套条件，父级拒绝更新时保留输入模型', async () => {
  const input: QuerySpec = { category: 'data', combine: 'all', conditions: [{ field: 'path', op: 'exists', value: 'items' }] }
  const wrapper = mount(QueryConditionEditor, { attachTo: document.body, props: { modelValue: input } })
  async function choose(label: string, value: string) {
    await wrapper.get(`[role="combobox"][aria-label="${label}"]`).trigger('click')
    await vi.waitFor(() => expect(document.querySelector(`[role="listbox"][aria-label="${label}"]`)).not.toBeNull())
    document.querySelector<HTMLElement>(`[role="listbox"][aria-label="${label}"] [data-option-value="${value}"]`)!.click()
  }
  try {
    await choose('条件 1 字段', 'value')
    await vi.waitFor(() => expect(wrapper.emitted('update:modelValue')).toHaveLength(1))
    const next = wrapper.emitted('update:modelValue')?.[0]?.[0] as QuerySpec
    expect(next.conditions[0]).toEqual({ field: 'value', op: 'contains', value: 'items' })
    expect(input.conditions[0]).toEqual({ field: 'path', op: 'exists', value: 'items' })
    expect(wrapper.props('modelValue')).toEqual(input)
    await wrapper.setProps({ modelValue: next })
    await choose('条件 1 值类型', 'number')
    await vi.waitFor(() => expect(wrapper.emitted('update:modelValue')).toHaveLength(2))
    const typed = wrapper.emitted('update:modelValue')?.[1]?.[0] as QuerySpec
    expect(typed.conditions[0]?.valueType).toBe('number')
    expect(next.conditions[0]?.valueType).toBeUndefined()
  }
  finally {
    wrapper.unmount()
  }
})
