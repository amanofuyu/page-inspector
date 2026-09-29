// @vitest-environment happy-dom
import type { QuerySpec } from '../features/query/engine'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import QueryConditionEditor from '../features/query/components/QueryConditionEditor.vue'

it('查询表单替换嵌套条件，父级拒绝更新时保留输入模型', async () => {
  const input: QuerySpec = { category: 'data', combine: 'all', conditions: [{ field: 'path', op: 'exists', value: 'items' }] }
  const wrapper = mount(QueryConditionEditor, { props: { modelValue: input } })
  try {
    await wrapper.get('[aria-label="条件 1 字段"]').setValue('value')
    const next = wrapper.emitted('update:modelValue')?.[0]?.[0] as QuerySpec
    expect(next.conditions[0]).toEqual({ field: 'value', op: 'contains', value: 'items' })
    expect(input.conditions[0]).toEqual({ field: 'path', op: 'exists', value: 'items' })
    expect(wrapper.props('modelValue')).toEqual(input)
    await wrapper.setProps({ modelValue: next })
    await wrapper.get('[aria-label="条件 1 值类型"]').setValue('number')
    const typed = wrapper.emitted('update:modelValue')?.[1]?.[0] as QuerySpec
    expect(typed.conditions[0]?.valueType).toBe('number')
    expect(next.conditions[0]?.valueType).toBeUndefined()
  }
  finally {
    wrapper.unmount()
  }
})
