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
    association: 'matched',
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
    const title = state.rows.value.find(row => row.key === 'title')!
    state.setExpanded(title.id, true)
    state.filters.value = { ...state.filters.value, group: 'basic' }
    state.display.value = 'html'
    expect(state.expanded.value).toBeNull()
    expect(JSON.stringify(state.dom.value)).toBe(original)
    expect(state.filters.value.group).toBe('basic')
  })

  it('同一文档重读保留展开位置，但详情始终从新快照派生', () => {
    const state = setup()
    const title = state.rows.value.find(row => row.key === 'title')!
    state.setExpanded(title.id, true)
    state.dom.value = snapshot('<title>更新后的标题</title>')
    expect(state.expanded.value).toBe(title.id)
    expect(state.rows.value.find(row => row.id === state.expanded.value)?.dom?.value).toBe('更新后的标题')
    expect(title.dom?.value).toBe('原始标题')
  })

  it('条目消失、切换文档或清空快照后不保留失效详情', () => {
    const state = setup()
    const description = state.rows.value.find(row => row.key === 'meta:x-custom')!
    state.setExpanded(description.id, true)
    state.dom.value = snapshot('<title>只有标题</title>')
    expect(state.expanded.value).toBeNull()
    state.setExpanded(state.rows.value[0]!.id, true)
    state.limit.value = 100
    state.dom.value = snapshot('<title>新页面</title>', '文档二')
    expect(state.expanded.value).toBeNull()
    expect(state.limit.value).toBe(50)
    state.dom.value = null
    expect(state.filtered.value).toEqual([])
  })

  it('每个视图实例独立保存组件状态，定位问题只更新该实例的筛选条件', () => {
    const first = setup()
    const second = setup()
    first.display.value = 'issues'
    first.filters.value = { ...first.filters.value, group: 'social', change: 'added' }
    first.locateIssue('meta:description')
    expect(first.display.value).toBe('compare')
    expect(first.filters.value).toMatchObject({ search: 'description', group: 'all', change: 'all' })
    expect(second.filters.value.search).toBe('')
  })

  it('旧行的关闭事件和失效行的打开事件不能覆盖当前展开行', () => {
    const state = setup()
    const first = state.rows.value[0]!
    const second = state.rows.value[1]!
    state.setExpanded(first.id, true)
    state.setExpanded(second.id, true)
    state.setExpanded(first.id, false)
    state.setExpanded('失效条目', true)
    expect(state.expanded.value).toBe(second.id)
  })
})
