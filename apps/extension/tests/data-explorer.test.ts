// @vitest-environment happy-dom
import type { DataNode } from '../features/nuxt/format'
import { mount } from '@vue/test-utils'
import { stringify } from 'devalue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref, shallowRef } from 'vue'
import DataView from '../features/inspector/DataView.vue'
import { usePayloadViewState } from '../features/inspector/usePayloadViewState'
import { fieldDetail } from '../features/nuxt/detail'
import { parseApp } from '../features/nuxt/parse'

const mounted: ReturnType<typeof mount>[] = []
const writeText = vi.fn(async (_text: string) => {})
beforeEach(() => {
  vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText)
  writeText.mockClear()
})
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function render(data: unknown) {
  const application = { id: '测试应用', label: '测试应用', serverRendered: true, externalUrl: null, sources: [{ kind: 'inline' as const, url: null, text: stringify({ data, state: { title: '状态值' }, _errors: { title: '错误值' }, config: { title: '元信息值' } }), bytes: 100, fetchedAt: 1 }] }
  const parsed = parseApp(application)
  const active = ref(true)
  const resolveNode = vi.fn((node: DataNode) => fieldDetail(parsed, node)?.tree?.root ?? node)
  const wrapper = mount(defineComponent({
    components: { DataView },
    setup() {
      return {
        ...usePayloadViewState(shallowRef(application), ref('测试应用'), ref(0)),
        application,
        active,
        resolveNode,
      }
    },
    template: '<DataView v-model:view="view" v-model:query="query" v-model:source-index="sourceIndex" :application="application" :parsed="parsed" :tree="tree" :source="source" :selected-node="selectedNode" :search="search" :found="found" :selection-context="selectionContext" :resolve-node="resolveNode" :active="active" />',
  }), { attachTo: document.body })
  mounted.push(wrapper)
  return { wrapper, active, resolveNode }
}

function row(wrapper: ReturnType<typeof mount>, key: string) {
  return wrapper.findAll('.tree-row').find(row => row.find('.tree-key').text() === key)!
}

async function copy(wrapper: ReturnType<typeof mount>, key: string, mode: string) {
  await row(wrapper, key).get('.ui-menu-trigger').trigger('click')
  await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull())
  const item = document.querySelector<HTMLElement>(`[role="menuitem"][data-value="${mode}"]`)!
  item.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', bubbles: true }))
  item.click()
  await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull())
}

describe('数据树与行内复制操作', () => {
  it('点击分支只展开或折叠子节点，叶子正文不提供详情按钮', async () => {
    const { wrapper } = render({ group: { title: '字段内容' } })
    expect(wrapper.find('.ui-split-handle').exists()).toBe(false)
    const branch = row(wrapper, 'group').get('.tree-toggle')
    expect(branch.attributes('aria-expanded')).toBe('false')
    await branch.trigger('click')
    expect(row(wrapper, 'title').exists()).toBe(true)
    expect(row(wrapper, 'title').get('.tree-main').element.tagName).toBe('DIV')
    await row(wrapper, 'title').get('.tree-main').trigger('click')
    expect(wrapper.find('[aria-label="字段详情"]').exists()).toBe(false)
    expect(branch.attributes('aria-expanded')).toBe('true')
    await branch.trigger('click')
    expect(wrapper.findAll('.tree-key').some(key => key.text() === 'title')).toBe(false)
    expect(branch.attributes('aria-expanded')).toBe('false')
  })

  it.each(['数据', '状态', '错误', '元信息', '全部'])('%s 分类与搜索结果点击字段均不打开详情，仍可复制完整值', async (label) => {
    const { wrapper } = render({ title: '数据值' })
    await wrapper.findAll('[role="tab"]').find(tab => tab.text() === label)!.trigger('click')
    await wrapper.get('[aria-label="搜索当前分类"]').setValue('title')
    await vi.waitFor(() => expect(wrapper.findAll('.search-result').length).toBeGreaterThan(0))
    const field = wrapper.get('.search-result .tree-main')
    expect(field.element.tagName).toBe('DIV')
    await field.trigger('click')
    expect(wrapper.find('[aria-label^="字段详情"]').exists()).toBe(false)
    expect(wrapper.find('.tree-inline-detail').exists()).toBe(false)
    const expected = label === '状态' ? '状态值' : label === '错误' ? '错误值' : label === '元信息' ? '元信息值' : '数据值'
    await copy(wrapper, 'title', 'value')
    expect(writeText).toHaveBeenLastCalledWith(expected)
  })

  it('未选择字段也可通过行尾菜单复制值、属性、路径和带类型数据，并透传成功提示', async () => {
    const value = '完整文本'.repeat(150)
    const { wrapper, resolveNode } = render({ title: value })
    expect(resolveNode).not.toHaveBeenCalled()
    await copy(wrapper, 'title', 'key')
    expect(writeText).toHaveBeenLastCalledWith('title')
    expect(resolveNode).not.toHaveBeenCalled()
    await copy(wrapper, 'title', 'value')
    expect(writeText).toHaveBeenLastCalledWith(value)
    await copy(wrapper, 'title', 'path')
    expect(writeText).toHaveBeenLastCalledWith('$["data"]["title"]')
    await copy(wrapper, 'title', 'typed')
    expect(JSON.parse(writeText.mock.calls.at(-1)![0])).toMatchObject({ format: 'page-inspector/v1', node: { key: 'title', type: 'string', value } })
    expect(wrapper.getComponent(DataView).emitted('notice')?.at(-1)).toEqual([{ kind: 'success', message: '已复制带类型的数据' }])
    expect(wrapper.find('.tree-inline-detail').exists()).toBe(false)
  })

  it('引用行的复制操作按当前字段解析完整值', async () => {
    const shared = { price: 120 }
    const { wrapper } = render({ original: shared, shared })
    expect(row(wrapper, 'shared').attributes('data-type')).toBe('Reference')
    await copy(wrapper, 'shared', 'value')
    expect(JSON.parse(writeText.mock.calls.at(-1)![0])).toEqual(shared)
    expect(wrapper.find('.tree-inline-detail').exists()).toBe(false)
  })

  it('超限值发出警告并保留剪贴板，属性名仍可直接复制', async () => {
    const { wrapper } = render(Array.from({ length: 10010 }, (_, index) => index))
    await copy(wrapper, 'data', 'key')
    expect(writeText).toHaveBeenLastCalledWith('data')
    await copy(wrapper, 'data', 'value')
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(wrapper.getComponent(DataView).emitted('notice')?.at(-1)?.[0]).toMatchObject({ kind: 'warning', message: expect.stringContaining('当前值超出展示上限') })
  })

  it('菜单支持键盘打开、Escape 恢复焦点，切换工作区关闭浮层', async () => {
    const { wrapper, active } = render({ title: '内容' })
    const trigger = row(wrapper, 'title').get('.ui-menu-trigger')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await vi.waitFor(() => expect(trigger.attributes('aria-expanded')).toBe('true'))
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.waitFor(() => expect(trigger.attributes('aria-expanded')).toBe('false'))
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger.element))
    await trigger.trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull())
    active.value = false
    await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull())
  })
})
