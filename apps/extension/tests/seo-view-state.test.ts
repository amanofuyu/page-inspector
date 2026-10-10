import type { SeoSnapshot } from '../features/seo/model'
import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { parseSeoHtml } from '../features/seo/parse-html'
import { useSeoViewState } from '../features/seo/useSeoViewState'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))
function snapshot(text: string, documentId = '文档一') {
  const value = parseSeoHtml({
    text,
    url: 'https://example.com/',
    source: 'navigation-response',
    sampledAt: 1000,
    status: 200,
    headers: [],
    identity: { tabId: 1, documentId, url: 'https://example.com/', initialUrl: 'https://example.com/', navigationStart: 100 },
  })
  value.source = 'live-dom'
  value.fields = value.fields.filter(field => field.group !== 'transport')
  return value
}
function setup() {
  const dom = shallowRef<SeoSnapshot | null>(snapshot('<title>原始标题</title><meta name="x-custom" content="描述">'))
  const html = shallowRef<SeoSnapshot | null>(null)
  const scope = effectScope()
  scopes.push(scope)
  const view = scope.run(() => useSeoViewState({ dom: () => dom.value, html: () => html.value }))!
  return { dom, html, ...view }
}

describe('sEO 业务快照与视图状态边界', () => {
  it('筛选、展开和页签切换不修改业务快照，也不触发重新采集', () => {
    const state = setup()
    const original = JSON.stringify(state.dom.value)
    const title = state.filtered.value.find(row => row.key === 'title')!
    state.setExpanded(title.id, true)
    state.filters.value = { ...state.filters.value, group: 'basic' }
    state.display.value = 'html'
    expect(state.expanded.value).toBeNull()
    expect(JSON.stringify(state.dom.value)).toBe(original)
    expect(state.filters.value.group).toBe('basic')
  })

  it('同一文档重读保留展开位置，但详情始终从新快照派生', () => {
    const state = setup()
    const title = state.filtered.value.find(row => row.key === 'title')!
    state.setExpanded(title.id, true)
    state.dom.value = snapshot('<title>更新后的标题</title>')
    expect(state.expanded.value).toBe(title.id)
    expect(state.filtered.value.find(row => row.id === state.expanded.value)?.value).toBe('更新后的标题')
    expect(title.value).toBe('原始标题')
  })

  it('条目消失、切换文档或清空快照后不保留失效详情', () => {
    const state = setup()
    const description = state.filtered.value.find(row => row.key === 'meta:x-custom')!
    state.setExpanded(description.id, true)
    state.dom.value = snapshot('<title>只有标题</title>')
    expect(state.expanded.value).toBeNull()
    state.setExpanded(state.filtered.value[0]!.id, true)
    state.limit.value = 100
    state.dom.value = snapshot('<title>新页面</title>', '文档二')
    expect(state.expanded.value).toBeNull()
    expect(state.limit.value).toBe(50)
    state.dom.value = null
    expect(state.filtered.value).toEqual([])
  })

  it('hTML 独立展示其字段，不合成 DOM 中的字段或缺失项', () => {
    const state = setup()
    state.html.value = snapshot('<meta name="description" content="只在 HTML 中">')
    state.display.value = 'html'
    expect(state.filtered.value.some(field => field.key === 'title')).toBe(false)
    expect(state.filtered.value.find(field => field.key === 'meta:description')?.value).toBe('只在 HTML 中')
  })

  it('旧行的关闭事件和失效行的打开事件不能覆盖当前展开行', () => {
    const state = setup()
    const first = state.filtered.value[0]!
    const second = state.filtered.value[1]!
    state.setExpanded(first.id, true)
    state.setExpanded(second.id, true)
    state.setExpanded(first.id, false)
    state.setExpanded('失效条目', true)
    expect(state.expanded.value).toBe(second.id)
  })
  it('内容分类切换保留关键词但清理分组条件和展开位置', () => {
    const state = setup()
    state.filters.value = { search: '描述', group: 'basic' }
    state.limit.value = 200
    state.section.value = 'social'
    expect(state.filters.value).toEqual({ search: '描述', group: 'all' })
    expect(state.expanded.value).toBeNull()
    expect(state.limit.value).toBe(50)
  })
})
