import type { PageSnapshot } from '../features/nuxt/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelCrawl, handleCrawl } from '../entrypoints/background/message/crawl'

const url = 'https://example.com/'
function snapshot(external = false): PageSnapshot {
  return { pageUrl: url, initialUrl: url, title: '测试', collectedAt: 0, warnings: [], apps: [{ id: 'app', label: 'app', serverRendered: true, externalUrl: external ? `${url}_payload.json` : null, sources: [{ kind: 'inline', text: '[{"data":1},{}]', bytes: 20, url, fetchedAt: 0 }] }] }
}
const request = (id: string, clientId = 'test') => ({ tabId: 7, requestId: id, clientId })
let executeScript: ReturnType<typeof vi.fn>
let getTab: ReturnType<typeof vi.fn>
beforeEach(() => {
  getTab = vi.fn().mockResolvedValue({ id: 7, url })
  executeScript = vi.fn().mockImplementation(async options => options.args
    ? [{ frameId: 0, documentId: 'doc-1', result: snapshot() }]
    : [{ frameId: 0, result: { url, initialUrl: url } }])
  vi.stubGlobal('browser', { tabs: { get: getTab }, scripting: { executeScript } })
})
afterEach(() => {
  cancelCrawl('test')
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('后台采集协调', () => {
  it('按指定标签页读取并在返回前验证同一文档', async () => {
    const response = await handleCrawl(request('one'))
    expect(response.status).toBe('ready')
    expect(response.documentId).toBe('doc-1')
    expect(getTab).toHaveBeenCalledWith(7)
    expect(executeScript.mock.calls[1]?.[0].target).toEqual({ tabId: 7, documentIds: ['doc-1'] })
    expect(JSON.parse(JSON.stringify(response))).toEqual(response)
  })
  it('页面导航后拒绝旧快照', async () => {
    executeScript.mockImplementation(async options => options.args
      ? [{ frameId: 0, documentId: 'doc-1', result: snapshot() }]
      : [{ frameId: 0, result: { url: `${url}other`, initialUrl: url } }])
    expect((await handleCrawl(request('one'))).status).toBe('stale')
  })
  it('延迟取消旧请求不会中止新请求', async () => {
    let release: ((value: unknown) => void) | undefined
    executeScript.mockImplementationOnce(() => new Promise((resolve) => {
      release = resolve
    }))
    const old = handleCrawl(request('old'))
    await vi.waitFor(() => expect(release).toBeDefined())
    const current = handleCrawl(request('new'))
    cancelCrawl('test', 'old')
    expect((await current).status).toBe('ready')
    release!([{ frameId: 0, documentId: 'doc-1', result: snapshot() }])
    expect((await old).status).toBe('stale')
  })
  it('受限页面、标签关闭及注入失败返回可解释错误', async () => {
    getTab.mockResolvedValueOnce({ id: 7, url: 'chrome://extensions/' })
    expect((await handleCrawl(request('one'))).message).toContain('HTTP')
    expect(executeScript).not.toHaveBeenCalled()
    getTab.mockRejectedValueOnce(new Error('标签已关闭'))
    expect((await handleCrawl(request('two'))).message).toContain('标签已关闭')
    executeScript.mockRejectedValueOnce(new Error('禁止注入'))
    expect((await handleCrawl(request('three'))).message).toContain('禁止注入')
  })
  it('外部来源失败仍返回内嵌内容', async () => {
    executeScript.mockImplementationOnce(async () => [{ frameId: 0, documentId: 'doc-1', result: snapshot(true) }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
    const response = await handleCrawl(request('one'))
    expect(response.status).toBe('ready')
    expect(response.snapshot!.apps[0]?.sources[0]?.text).toContain('data')
    expect(response.snapshot!.apps[0]?.sources[1]?.error).toContain('404')
  })
  it('外部请求超时可以返回部分内容', async () => {
    vi.useFakeTimers()
    executeScript.mockImplementationOnce(async () => [{ frameId: 0, documentId: 'doc-1', result: snapshot(true) }])
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('超时')))
    })))
    const pending = handleCrawl(request('one'))
    await vi.advanceTimersByTimeAsync(15001)
    const response = await pending
    expect(response.status).toBe('ready')
    expect(response.snapshot!.warnings.join()).toContain('超时')
  })
})
