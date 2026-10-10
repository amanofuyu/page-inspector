import type { NetworkSession } from '../features/network/session'
import type { SeoHtmlInput, SeoIdentity } from '../features/seo/model'
import { describe, expect, it, vi } from 'vitest'
import { headerCanonicals } from '../features/seo/link-header'
import { parseSeoHtml } from '../features/seo/parse-html'
import { seoFieldPreview } from '../features/seo/preview'
import { navigationCandidate } from '../features/seo/sources'

const identity: SeoIdentity = { tabId: 1, documentId: 'doc1', url: 'https://example.com/page', initialUrl: 'https://example.com/page', navigationStart: 10000 }
function snapshot(text: string, overrides: Partial<SeoHtmlInput> = {}) {
  return parseSeoHtml({ text, url: identity.url, identity, source: 'navigation-response', sampledAt: 12000, status: 200, headers: [], ...overrides })
}
describe('sEO 只读字段提取', () => {
  it('保留实体、重复标签、相对链接、正文 JSON-LD 和各级标题，忽略模板', () => {
    const result = snapshot('<html lang="zh-CN"><head><title>A &amp; B</title><meta name="description" content="一"><meta name="DESCRIPTION" content="二"><link rel="canonical" href="item?q=1"><noscript><meta name="robots" content="noindex"></noscript></head><body><h1>主<b>标题</b></h1><h2>次级标题</h2><template><h1>模板</h1></template><script type="application/ld+json">{"@graph":[{"@type":"Article"}]}</script></body></html>')
    expect(result.fields.find(field => field.key === 'title')?.value).toBe('A & B')
    expect(result.fields.filter(field => field.key === 'meta:description').map(field => field.value)).toEqual(['一', '二'])
    expect(result.fields.find(field => field.key === 'link:canonical')?.value).toBe('item?q=1')
    expect(result.fields.filter(field => field.group === 'headings').map(field => field.value)).toEqual(['主标题', '次级标题'])
    expect(result.fields.some(field => field.key === 'meta:robots')).toBe(false)
    expect(result.fields.find(field => field.key === 'jsonld')?.jsonTypes).toEqual(['Article'])
  })
  it('超出字段和 HTML 预算时保留截断标记或拒绝解析', () => {
    const result = snapshot(`<title>${'x'.repeat(20000)}</title>`)
    expect(result.complete).toBe(false)
    expect(result.fields.find(field => field.key === 'title')?.truncated).toBe(true)
    expect(() => snapshot('x'.repeat(5 * 1024 * 1024 + 1))).toThrow('5 MiB')
  })
  it('jSON-LD 保留数字精度、重复键和原顺序；语法错误仍可查看原文', () => {
    const text = '{"name":"一","name":"二","number":9007199254740993,"@type":"Article"}'
    const field = snapshot(`<script type="application/ld+json">${text}</script>`).fields.find(field => field.key === 'jsonld')!
    expect(field.value).toBe(text)
    expect(seoFieldPreview(field).text.replace(/\s/g, '')).toBe(text)
    const broken = snapshot('<script type="application/ld+json">{"bad"}</script>').fields.find(field => field.key === 'jsonld')!
    expect(broken.jsonError).toBeDefined()
    expect(broken.value).toBe('{"bad"}')
    const deep = snapshot(`<script type="application/ld+json">${'['.repeat(110)}0${']'.repeat(110)}</script>`)
    expect(deep.fields.find(field => field.key === 'jsonld')?.jsonError).toBeUndefined()
  })
  it('hTTP Link 保留原值，并按响应地址展示 canonical', () => {
    const value = '<item?a=1,2>; title="a,b; c"; rel="alternate canonical", </other>; rel=canonical; anchor="/elsewhere"'
    expect(headerCanonicals(value, identity.url).map(item => item.target)).toEqual(['https://example.com/item?a=1,2'])
    const result = snapshot('', { headers: [{ name: 'link', value }] })
    expect(result.fields.find(field => field.key === 'http:link')?.value).toBe(value)
    expect(result.fields.find(field => field.key === 'http:canonical')?.value).toBe('https://example.com/item?a=1,2')
    expect(snapshot('', { headers: [{ name: 'link', value, truncated: true }] }).complete).toBe(false)
  })
  it('hTML 只读取本次文档的唯一响应，拒绝旧路由、框架歧义及未知体积', () => {
    const record = { id: 'request', resourceType: 'document', url: identity.url, documentId: identity.documentId, pageStartedAt: 10000, ambiguous: false, status: 200, redirectUrl: null, mime: 'text/html', contentSize: 100 }
    const session = { records: [record], setDocument: vi.fn() } as unknown as NetworkSession
    expect(navigationCandidate(session, identity, 0).id).toBe('request')
    expect(() => navigationCandidate(session, { ...identity, url: 'https://example.com/route' }, 0)).toThrow('路由')
    expect(() => navigationCandidate(session, identity, 1)).toThrow('子框架')
    record.ambiguous = true
    expect(() => navigationCandidate(session, identity, 0)).toThrow('唯一')
    record.ambiguous = false
    record.contentSize = -1
    session.records[0]!.contentSize = null
    expect(() => navigationCandidate(session, identity, 0)).toThrow('大小未知')
  })
})
