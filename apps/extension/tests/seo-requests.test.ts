import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseSeoHtml } from '../features/seo/parse-html'
import { requestHreflang, requestSeoHeaders } from '../features/seo/requests'

const { parseHtmlWorker } = vi.hoisted(() => ({ parseHtmlWorker: vi.fn() }))
vi.mock('../features/seo/html-worker', () => ({ parseHtmlWorker }))
const fetchMock = vi.fn()
const url = 'https://example.com/page'
const source = parseSeoHtml({ text: '', url, identity: { tabId: 1, documentId: '文档', url, initialUrl: url, navigationStart: 1 }, source: 'navigation-response', status: 200, sampledAt: 1, headers: [] })
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  parseHtmlWorker.mockReset().mockImplementation(async input => parseSeoHtml(input))
})
afterEach(() => vi.unstubAllGlobals())

describe('页面 SEO 手动响应头与 hreflang 请求', () => {
  it('头部请求不携带凭据，不请求正文，不支持时不自动改为 GET', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'x-robots-tag': 'noindex, nofollow', 'content-type': 'text/html' } }))
    const signal = new AbortController().signal
    const result = await requestSeoHeaders(url, signal)
    expect(result.headers.find(header => header.name === 'x-robots-tag')?.value).toBe('noindex, nofollow')
    expect(fetchMock).toHaveBeenCalledWith(url, { method: 'HEAD', credentials: 'omit', signal })
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 405 }))
    await expect(requestSeoHeaders(url, signal)).rejects.toThrow('不支持 HEAD')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await expect(requestSeoHeaders('javascript:alert(1)', signal)).rejects.toThrow('HTTP(S)')
  })

  it('回链必须是 alternate hreflang 的完整地址匹配，尊重重定向后的 base', async () => {
    const signal = new AbortController().signal
    const response = new Response('<base href="https://example.com/"><link rel="alternate" hreflang="en" href="page">', { headers: { 'content-type': 'text/html;charset=utf-8' } })
    Object.defineProperty(response, 'url', { value: 'https://other.example/fr' })
    fetchMock.mockResolvedValueOnce(response)
    expect((await requestHreflang(source, '/fr', signal)).backReference).toBe(true)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://example.com/fr')
    fetchMock.mockResolvedValueOnce(new Response('<link rel="alternate" hreflang="en" href="https://example.com/page-suffix"><a href="https://example.com/page">普通链接</a>', { headers: { 'content-type': 'text/html' } }))
    expect((await requestHreflang(source, '/fr', signal)).backReference).toBe(false)
  })

  it('错误状态不解析正文，非 HTML、超大和压缩后超预算响应被拒绝', async () => {
    const signal = new AbortController().signal
    fetchMock.mockResolvedValueOnce(new Response('未找到', { status: 404 }))
    expect((await requestHreflang(source, '/fr', signal)).backReference).toBeNull()
    expect(parseHtmlWorker).not.toHaveBeenCalled()
    fetchMock.mockResolvedValueOnce(new Response('{}', { headers: { 'content-type': 'application/json' } }))
    await expect(requestHreflang(source, '/fr', signal)).rejects.toThrow('不是 HTML')
    fetchMock.mockResolvedValueOnce(new Response('', { headers: { 'content-type': 'text/html', 'content-length': String(6 * 1024 * 1024) } }))
    await expect(requestHreflang(source, '/fr', signal)).rejects.toThrow('5 MiB')
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array(5 * 1024 * 1024 + 1), { headers: { 'content-type': 'text/html', 'content-length': '100' } }))
    await expect(requestHreflang(source, '/fr', signal)).rejects.toThrow('5 MiB')
    expect(parseHtmlWorker).not.toHaveBeenCalled()
  })

  it('解析不完整时没有回链不能判定为无，取消信号阻止继续读取', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { headers: { 'content-type': 'text/html' } }))
    parseHtmlWorker.mockResolvedValueOnce({ fields: [], complete: false })
    expect((await requestHreflang(source, '/fr', new AbortController().signal)).backReference).toBeNull()
    const controller = new AbortController()
    controller.abort()
    fetchMock.mockResolvedValueOnce(new Response('', { headers: { 'content-type': 'text/html' } }))
    await expect(requestHreflang(source, '/fr', controller.signal)).rejects.toThrow()
  })
})
