import type { NetworkSession } from '../features/network/session'
import type { SeoHtmlInput, SeoIdentity } from '../features/seo/model'
import { describe, expect, it, vi } from 'vitest'
import { SeoBaselines } from '../features/seo/baselines'
import { compareSeo, inspectSeo, seoMarkdown, seoReport } from '../features/seo/compare'
import { headerCanonicals } from '../features/seo/link-header'
import { parseSeoHtml } from '../features/seo/parse-html'
import { navigationCandidate, readReferenceHtml } from '../features/seo/sources'

const identity: SeoIdentity = { tabId: 1, documentId: 'doc1', url: 'https://example.com/page', initialUrl: 'https://example.com/page', navigationStart: 10000 }
function snapshot(text: string, overrides: Partial<SeoHtmlInput> = {}) {
  return parseSeoHtml({ text, url: identity.url, identity, source: 'navigation-response', association: 'matched', sampledAt: 12000, status: 200, headers: [], ...overrides })
}
function live(text: string) {
  const result = snapshot(text)
  result.source = 'live-dom'
  result.fields = result.fields.filter(field => field.group !== 'transport')
  return result
}
describe('sEO 提取与真实来源对比', () => {
  it('按 HTML 语义提取实体、base、重复标签、正文 JSON-LD 和 H1，忽略 H2—H6／noscript／template', () => {
    const result = snapshot('<html lang="zh-CN"><head><base href="/catalog/"><title>A &amp; B</title><meta name="description" content="一"><meta name="DESCRIPTION" content="二"><link rel="canonical" href="item?q=1"><meta property="og:image" content="a.png"><meta property="og:image" content="b.png"><noscript><meta name="robots" content="noindex"></noscript></head><body><h1>主<b>标题</b></h1><h2>次级标题</h2><h3>三级标题</h3><h4>四级标题</h4><h5>五级标题</h5><h6>六级标题</h6><template><h1>模板</h1></template><script type="application/ld+json">{"@graph":[{"@type":"Article"}]}</script></body></html>')
    expect(result.complete).toBe(true)
    expect(result.fields.find(field => field.key === 'title')?.value).toBe('A & B')
    expect(result.fields.filter(field => field.key === 'meta:description')).toHaveLength(2)
    expect(result.fields.find(field => field.key === 'link:canonical')?.normalized).toBe('https://example.com/catalog/item?q=1')
    expect(result.fields.filter(field => field.key === 'meta:og:image')).toHaveLength(2)
    expect(result.fields.some(field => field.key === 'meta:robots')).toBe(false)
    expect(result.fields.filter(field => field.group === 'headings').map(field => field.value)).toEqual(['主标题'])
    expect(result.fields.find(field => field.group === 'structured')?.jsonTypes).toEqual(['Article'])
  })
  it('同一基线下分别标记已有、新增、修改、删除；HTTP 规则不是 DOM 删除', () => {
    const html = snapshot('<title>旧</title><meta name="description" content="相同"><meta name="robots" content="noindex">', { headers: [{ name: 'x-robots-tag', value: 'googlebot: noarchive' }] })
    const dom = live('<title>新</title><meta name="description" content="相同"><meta property="og:title" content="新增">')
    const changes = Object.fromEntries(compareSeo(dom, html).map(row => [row.key, row.change]))
    expect(changes).toMatchObject({ 'title': 'changed', 'meta:description': 'initial', 'meta:robots': 'removed', 'meta:og:title': 'added', 'http:x-robots-tag': 'transport' })
    expect(inspectSeo(dom, html).some(issue => issue.id.startsWith('initial-noindex'))).toBe(true)
  })
  it('重新请求永远只作参考；旧路由、旧文档和其他标签页不参加比较', () => {
    const dom = live('<title>新</title>')
    const reference = snapshot('<title>旧</title>', { source: 'refetch-reference', association: 'reference' })
    expect(compareSeo(dom, reference).find(row => row.key === 'title')?.change).toBe('reference')
    for (const patch of [{ url: 'https://example.com/other' }, { documentId: 'old' }, { tabId: 2 }, { navigationStart: 9000 }]) {
      const old = snapshot('<title>旧</title>', { identity: { ...identity, ...patch } })
      expect(compareSeo(dom, old).every(row => row.change === 'unknown')).toBe(true)
    }
  })
  it('预算不足或字段截断不能断言新增／删除或输出虚假的缺失问题', () => {
    const html = snapshot('<title>标题</title>')
    const dom = live('<meta name="description" content="新">')
    html.complete = false
    dom.complete = false
    expect(compareSeo(dom, html).filter(row => row.group !== 'transport').every(row => row.change === 'unknown' || row.change === 'initial')).toBe(true)
    expect(inspectSeo(dom, html).some(issue => issue.id === 'missing-title')).toBe(false)
    const large = snapshot(`<title>${'x'.repeat(20000)}</title>`)
    expect(large.complete).toBe(false)
    expect(large.fields.find(field => field.key === 'title')?.truncated).toBe(true)
    const initialNoindex = snapshot('<meta name="robots" content="noindex">')
    expect(inspectSeo(dom, initialNoindex).some(issue => issue.id.startsWith('initial-noindex'))).toBe(false)
  })
  it('jSON-LD 保留数组顺序，对象键顺序不产生假变化；非法 JSON 单独报错', () => {
    const a = snapshot('<script type="application/ld+json">{"@type":"Article","name":"A"}</script>')
    const b = live('<script type="application/ld+json">{"name":"A","@type":"Article"}</script>')
    expect(compareSeo(b, a).find(row => row.key === 'jsonld')?.change).toBe('initial')
    const broken = live('<script type="application/ld+json">{"bad"}</script>')
    expect(inspectSeo(broken, null).some(issue => issue.level === 'problem' && issue.key === 'jsonld')).toBe(true)
  })
  it('检测冲突 canonical、空标题与重复 description，不把多 og:image 当错误', () => {
    const dom = live('<title></title><meta name="description" content="一"><meta name="description" content="二"><link rel="canonical" href="/a"><link rel="canonical" href="/b"><meta property="og:image" content="/a.png"><meta property="og:image" content="/b.png">')
    const issues = inspectSeo(dom, null)
    expect(issues.map(issue => issue.id)).toEqual(expect.arrayContaining(['empty-title', 'duplicate-meta:description', 'canonical-live-dom']))
    expect(issues.some(issue => issue.key === 'meta:og:image')).toBe(false)
    expect(seoReport(dom, null).format).toBe('page-inspector-seo/v1')
    expect(seoMarkdown(dom, null)).toContain('来源未确认')
  })
  it('复制的 JSON-LD 保持有效 JSON，深层合法数据超预算时不能误报语法错误', () => {
    const data = { '@type': 'Article', 'name': 'A & B <tag> "quote"' }
    const field = live(`<script type="application/ld+json">${JSON.stringify(data)}</script>`).fields.find(field => field.key === 'jsonld')!
    const copied = field.snippet.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')
    expect(JSON.parse(copied)).toEqual(data)
    const deep = live(`<script type="application/ld+json">${'['.repeat(110)}0${']'.repeat(110)}</script>`)
    expect(deep.complete).toBe(false)
    expect(deep.fields.find(field => field.key === 'jsonld')).toMatchObject({ truncated: true })
    expect(inspectSeo(deep, null).some(issue => issue.level === 'problem' && issue.key === 'jsonld')).toBe(false)
  })
})
describe('sEO 响应来源与有界缓存', () => {
  it('link canonical 按响应地址解析，保留逗号／引号并忽略其他上下文和截断值', () => {
    const value = '<item?a=1,2>; title="a,b; c"; rel="alternate canonical", </wrong>; rel=next; rel=canonical, </other>; rel=canonical; anchor="/elsewhere"'
    expect(headerCanonicals(value, identity.url).map(item => item.target)).toEqual(['https://example.com/item?a=1,2'])
    const html = snapshot('<base href="https://other.example/">', { headers: [{ name: 'link', value }] })
    const canonical = html.fields.find(field => field.key === 'http:canonical')!
    expect(canonical.normalized).toBe('https://example.com/item?a=1,2')
    expect(compareSeo(live(''), html).find(row => row.key === 'http:canonical')?.change).toBe('transport')
    const partial = snapshot('', { headers: [{ name: 'link', value: '</target>; rel=canonical', truncated: true }] })
    expect(partial.complete).toBe(false)
    expect(partial.fields.some(field => field.key === 'http:canonical')).toBe(false)
  })
  it('只有唯一导航文档可以匹配；SPA、子框架、歧义和未知大小都降级', () => {
    const record = { id: 'request', resourceType: 'document', url: identity.url, documentId: identity.documentId, pageStartedAt: 10000, ambiguous: false, status: 200, redirectUrl: null, mime: 'text/html', contentSize: 100 }
    const session = { setDocument: vi.fn(), records: [record] } as unknown as NetworkSession
    expect(navigationCandidate(session, identity, 0).id).toBe('request')
    for (const status of [204, 205, 206, 304]) {
      record.status = status
      expect(() => navigationCandidate(session, identity, 0)).toThrow('完整的 HTML')
    }
    record.status = 200
    expect(() => navigationCandidate(session, identity, 1)).toThrow('子框架')
    expect(() => navigationCandidate(session, { ...identity, url: 'https://example.com/next' }, 0)).toThrow('同文档路由')
    session.records.push({ ...record } as any)
    expect(() => navigationCandidate(session, identity, 0)).toThrow('唯一关联')
    session.records.pop()
    record.ambiguous = true
    expect(() => navigationCandidate(session, identity, 0)).toThrow('唯一关联')
    record.ambiguous = false
    record.contentSize = null as any
    expect(() => navigationCandidate(session, identity, 0)).toThrow('大小未知')
  })
  it('参考响应流式限额、编码和凭证／跳转策略明确，HTTP 错误页面保留状态', async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([60, 116, 105, 116, 108, 101, 62, 233, 60, 47, 116, 105, 116, 108, 101, 62]), { status: 404, headers: { 'content-type': 'text/html;charset=windows-1252', 'x-robots-tag': 'noindex' } }))
    const result = await readReferenceHtml(identity, new AbortController().signal, fetcher)
    expect(result.text).toBe('<title>é</title>')
    expect(result.status).toBe(404)
    expect(result.source).toBe('refetch-reference')
    expect(fetcher).toHaveBeenCalledWith(identity.url, expect.objectContaining({ credentials: 'include', redirect: 'error' }))
    const tooLarge = vi.fn(async () => new Response('x', { headers: { 'content-type': 'text/html', 'content-length': '999999999' } }))
    await expect(readReferenceHtml(identity, new AbortController().signal, tooLarge)).rejects.toThrow('5 MiB')
    const stream = vi.fn(async () => new Response(new Uint8Array(5 * 1024 * 1024 + 1), { headers: { 'content-type': 'text/html' } }))
    await expect(readReferenceHtml(identity, new AbortController().signal, stream)).rejects.toThrow('5 MiB')
  })
  it('会话共享只接受真实基线，匹配文档、清理与过期均有效', () => {
    vi.useFakeTimers()
    try {
      const cache = new SeoBaselines()
      const baseline = snapshot('<title>标题</title>')
      cache.put(baseline)
      expect(cache.get(identity)).toBe(baseline)
      expect(cache.get({ ...identity, documentId: 'other' })).toBeNull()
      expect(() => cache.put({ ...baseline, source: 'refetch-reference' })).toThrow('实际文档')
      vi.advanceTimersByTime(10 * 60 * 1000 + 1)
      expect(cache.get(identity)).toBeNull()
      cache.put(baseline)
      cache.clear(1)
      expect(cache.get(identity)).toBeNull()
    }
    finally { vi.useRealTimers() }
  })
})
