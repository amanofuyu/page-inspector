// @vitest-environment happy-dom
import type { DataNode } from '../features/nuxt/format'
import { mount } from '@vue/test-utils'
import { stringify } from 'devalue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, ref, shallowRef } from 'vue'
import DataView from '../features/inspector/DataView.vue'
import { useDataSelection } from '../features/inspector/useDataSelection'
import { fieldDetail } from '../features/nuxt/detail'
import { buildPayloadView } from '../features/nuxt/format'
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
  const application = { id: '测试应用', label: '测试应用', serverRendered: true, externalUrl: null, sources: [{ kind: 'inline' as const, url: null, text: stringify({ data }), bytes: 100, fetchedAt: 1 }] }
  const parsed = parseApp(application)
  const tree = buildPayloadView(parsed.payload!, 'data')!
  const active = ref(true)
  const resolveNode = vi.fn((node: DataNode) => fieldDetail(parsed, node)?.tree?.root ?? node)
  const wrapper = mount(defineComponent({
    components: { DataView },
    setup() {
      const selection = useDataSelection(shallowRef(tree.root), ref('测试应用:data'))
      const detail = computed(() => selection.visible.value ? fieldDetail(parsed, selection.selected.value!) : null)
      return {
        application,
        parsed,
        tree,
        active,
        resolveNode,
        detail,
        focused: selection.selected,
        visible: selection.visible,
        select: selection.select,
        view: ref('data'),
        query: ref(''),
        sourceIndex: ref(0),
      }
    },
    template: '<DataView v-model:view="view" v-model:query="query" v-model:source-index="sourceIndex" v-model:detail-visible="visible" :application="application" :parsed="parsed" :tree="tree" :selected-node="tree.root" :focused-node="focused" search="" :found="{ matches: [], limited: false }" selection-context="测试应用:data" :data-detail="detail" :source-labels="[\'内嵌 · 测试来源\']" :resolve-node="resolveNode" :active="active" @select="select" />',
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

describe('合并数据树与行内字段操作', () => {
  it('字段详情在对应行下方展开，再次点击收起，与分支展开相互独立', async () => {
    const { wrapper } = render({ group: { title: '字段内容' } })
    expect(wrapper.find('.ui-split-handle').exists()).toBe(false)
    expect(wrapper.find('.tree-inline-detail').exists()).toBe(false)
    await row(wrapper, 'group').get('.tree-select').trigger('click')
    const detail = wrapper.get('.tree-inline-detail')
    expect(row(wrapper, 'group').get('.tree-select').attributes('aria-controls')).toBe(detail.attributes('id'))
    expect(detail.get('.detail-field-key').text()).toBe('group')
    expect(detail.text()).toContain('字段来源：内嵌 · 测试来源')
    expect(detail.find('.tree-node').exists()).toBe(false)
    expect(row(wrapper, 'group').get('.tree-expand').attributes('aria-expanded')).toBe('false')
    await row(wrapper, 'group').get('.tree-expand').trigger('click')
    expect(row(wrapper, 'title').exists()).toBe(true)
    expect(wrapper.find('.tree-inline-detail').exists()).toBe(true)
    await row(wrapper, 'group').get('.tree-select').trigger('click')
    expect(wrapper.find('.tree-inline-detail').exists()).toBe(false)
    expect(row(wrapper, 'group').get('.tree-expand').attributes('aria-expanded')).toBe('true')
  })

  it('深层字段在自身行内展示完整长文本和路径，关闭按钮收起详情', async () => {
    const value = '完整文本'.repeat(150)
    const { wrapper } = render({ group: { title: value } })
    await row(wrapper, 'group').get('.tree-expand').trigger('click')
    await row(wrapper, 'title').get('.tree-select').trigger('click')
    const detail = wrapper.get('.tree-inline-detail')
    expect(detail.element.closest('.tree-node')).toBe(row(wrapper, 'title').element.parentElement)
    expect(detail.get('.detail-value').text()).toBe(value)
    expect(detail.get('.mono').text()).toBe('$["data"]["group"]["title"]')
    const close = detail.get('[aria-label="收起字段详情"]')
    ;(close.element as HTMLElement).focus()
    await close.trigger('click')
    expect(wrapper.find('.tree-inline-detail').exists()).toBe(false)
    expect(document.activeElement).toBe(row(wrapper, 'title').get('.tree-select').element)
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

  it('引用行按当前字段解析完整值，详情仍可在行内查看局部结构', async () => {
    const shared = { price: 120 }
    const { wrapper } = render({ original: shared, shared })
    expect(row(wrapper, 'shared').attributes('data-type')).toBe('Reference')
    await copy(wrapper, 'shared', 'value')
    expect(JSON.parse(writeText.mock.calls.at(-1)![0])).toEqual(shared)
    await row(wrapper, 'shared').get('.tree-select').trigger('click')
    expect(wrapper.get('.tree-inline-detail').text()).toContain('完整字段结构')
    expect(wrapper.get('.tree-inline-detail').text()).toContain('price')
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
