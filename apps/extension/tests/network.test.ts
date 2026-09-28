import type { HarRequest, NetworkApi, NetworkRecord } from '../features/network/session'
import type { CollectedApp, PageSnapshot } from '../features/nuxt/types'
import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { associate, NETWORK_LIMITS, NetworkSession, responseSnapshot } from '../features/network/session'

function event<T>() {
  const listeners = new Set<(value: T) => void>()
  return { addListener: (callback: (value: T) => void) => {
    listeners.add(callback)
  }, removeListener: (callback: (value: T) => void) => {
    listeners.delete(callback)
  }, fire: (value: T) => {
    for (const listener of listeners)
      listener(value)
  }, listeners }
}
function api() {
  return { onRequestFinished: event<HarRequest>(), onNavigated: event<string>(), getHAR: vi.fn((callback: Parameters<NetworkApi['getHAR']>[0]) => callback({ entries: [], pages: [{ id: 'page-1', startedDateTime: new Date(10000).toISOString() }] })) }
}
function request(overrides: Partial<HarRequest> = {}): HarRequest {
  return { startedDateTime: new Date(11000).toISOString(), time: 120, pageref: 'page-1', request: { url: 'https://example.com/_payload.json?q=1', method: 'GET' }, response: { status: 200, bodySize: 20, content: { size: 30, mimeType: 'application/json' } }, getContent: callback => callback('[{"data":1},"payload"]', ''), ...overrides }
}
const sessions: NetworkSession[] = []
function start() {
  const source = api()
  const session = new NetworkSession()
  sessions.push(session)
  session.start(source)
  session.setDocument('document1', 10000)
  return { source, session }
}
afterEach(() => {
  for (const session of sessions.splice(0))
    session.dispose()
  vi.useRealTimers()
})
describe('devTools 网络会话', () => {
  it('默认不读取正文，同 URL 的不同请求分别保留，元信息不保存凭据', () => {
    const { source, session } = start()
    const getContent = vi.fn()
    source.onRequestFinished.fire(request({ getContent }))
    source.onRequestFinished.fire(request({ startedDateTime: new Date(12000).toISOString(), getContent }))
    expect(session.records).toHaveLength(2)
    expect(getContent).not.toHaveBeenCalled()
    expect(JSON.stringify(session.records)).not.toContain('headers')
    expect(session.records[0]!.contentSize).toBe(30)
    expect(session.records[0]!.bodySize).toBe(20)
  })
  it('历史与实时事件去重，不合并 URL 相同但时间不同的请求', () => {
    const source = api()
    const first = request()
    source.getHAR.mockImplementation(callback => callback({ entries: [first], pages: [] }))
    const session = new NetworkSession()
    sessions.push(session)
    session.start(source)
    source.onRequestFinished.fire({ ...first })
    source.onRequestFinished.fire(request({ startedDateTime: new Date(13000).toISOString() }))
    expect(session.records).toHaveLength(2)
    expect(session.records[0]!.imported).toBe(false)
  })
  it('base64 正文解码后按 UTF-8 计量，缓存读取不重复调用浏览器', async () => {
    const { source, session } = start()
    const text = '中文😀'
    const getContent = vi.fn(callback => callback(Buffer.from(text).toString('base64'), 'base64'))
    source.onRequestFinished.fire(request({ getContent }))
    const body = await session.read(session.records[0]!.id)
    expect(body.text).toBe(text)
    expect(body.bytes).toBe(10)
    await session.read(session.records[0]!.id)
    expect(getContent).toHaveBeenCalledTimes(1)
    expect(session.bodyBytes).toBe(10)
  })
  it('未知大小、声明过大与实际超限均不能进入缓存', async () => {
    const { source, session } = start()
    const getContent = vi.fn(callback => callback('x', ''))
    source.onRequestFinished.fire(request({ response: { status: 200, content: { size: -1 } }, getContent }))
    await expect(session.read(session.records[0]!.id)).rejects.toThrow('大小未知')
    expect(getContent).not.toHaveBeenCalled()
    source.onRequestFinished.fire(request({ startedDateTime: new Date(12000).toISOString(), response: { content: { size: NETWORK_LIMITS.bodyBytes + 1 } }, getContent }))
    await expect(session.read(session.records[1]!.id)).rejects.toThrow('12 MiB')
    source.onRequestFinished.fire(request({ startedDateTime: new Date(13000).toISOString(), getContent: callback => callback('x'.repeat(NETWORK_LIMITS.bodyBytes + 10), '') }))
    await expect(session.read(session.records[2]!.id)).rejects.toThrow('超过')
    expect(session.bodyBytes).toBe(0)
  })
  it('304、零传输大小与正文不可读分别表示，正文缓存按 LRU 释放', async () => {
    const { source, session } = start()
    source.onRequestFinished.fire(request({ response: { status: 304, bodySize: 0, content: { size: 0 } }, getContent: callback => callback('', '') }))
    await expect(session.read(session.records[0]!.id)).rejects.toThrow('未提供')
    expect(session.records[0]!.bodySize).toBe(0)
    for (const i of [1, 2]) {
      source.onRequestFinished.fire(request({ startedDateTime: new Date(11000 + i).toISOString(), response: { status: 200, bodySize: 0, content: { size: 7 * 1024 * 1024 } }, getContent: callback => callback('x'.repeat(7 * 1024 * 1024), '') }))
      await session.read(session.records.at(-1)!.id)
    }
    expect(session.records[1]!.bodyState).toBe('evicted')
    expect(session.bodyBytes).toBe(7 * 1024 * 1024)
  })
  it('完整导航丢弃迟到正文，关闭清理监听、句柄与缓存', async () => {
    const { source, session } = start()
    let respond: (content: string, encoding: string) => void = () => {
    }
    source.onRequestFinished.fire(request({ getContent: (callback) => {
      respond = callback
    } }))
    const pending = session.read(session.records[0]!.id)
    source.onNavigated.fire('https://example.com/next')
    respond('old', '')
    await expect(pending).rejects.toThrow('忽略迟到')
    expect(session.records).toHaveLength(0)
    expect(session.bodyBytes).toBe(0)
    session.dispose()
    expect(source.onRequestFinished.listeners.size).toBe(0)
    expect(source.onNavigated.listeners.size).toBe(0)
  })
  it('慢主文档先保留，再按 HAR 与文档导航起点确认归属，已核实的旧请求不混入', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(25000)
    const { source, session } = start()
    const current = request({ pageref: 'page-2', startedDateTime: new Date(20000).toISOString(), request: { url: 'https://example.com/new', method: 'GET' } })
    source.getHAR.mockImplementation(callback => callback({ entries: [current], pages: [{ id: 'page-2', startedDateTime: new Date(20000).toISOString() }] }))
    source.onNavigated.fire('https://example.com/new')
    session.setDocument('document2', 20000.4)
    source.onRequestFinished.fire(current)
    expect(session.records).toHaveLength(1)
    expect(session.records[0]!.generation).toBeNull()
    await vi.advanceTimersByTimeAsync(300)
    expect(session.records[0]).toMatchObject({ generation: 1, documentId: 'document2', url: 'https://example.com/new' })
    source.onRequestFinished.fire(request())
    expect(session.records).toHaveLength(1)
  })
  it('没有 HAR 页面依据的慢请求保留为未知归属', () => {
    const { source, session } = start()
    source.onNavigated.fire('https://example.com/new')
    session.setDocument('document2', 20000)
    source.onRequestFinished.fire(request({ pageref: undefined, startedDateTime: new Date(1).toISOString() }))
    expect(session.records[0]).toMatchObject({ generation: null, documentId: null, pageStartedAt: null })
  })
  it('保留导航记录时迟到旧响应保留旧归属，旧快照不能绑定新文档', () => {
    const { source, session } = start()
    session.preserve = true
    source.onNavigated.fire('https://example.com/new')
    session.setDocument('document1', 10000)
    session.setDocument('document2', 20000)
    source.onRequestFinished.fire(request())
    expect(session.records[0]).toMatchObject({ generation: 0, documentId: 'document1' })
  })
  it('保留记录仍按页面分代，500 条和元信息总预算都会释放旧记录', async () => {
    vi.useFakeTimers()
    const { source, session } = start()
    session.preserve = true
    source.onRequestFinished.fire(request())
    const startedAt = Date.now()
    source.getHAR.mockImplementation(callback => callback({ entries: [], pages: [{ id: 'page-2', startedDateTime: new Date(startedAt).toISOString() }] }))
    source.onNavigated.fire('https://example.com/next')
    session.setDocument('document2', startedAt)
    await vi.advanceTimersByTimeAsync(300)
    for (let i = 0; i < 505; i++)
      source.onRequestFinished.fire(request({ pageref: 'page-2', startedDateTime: new Date(Date.now() + i).toISOString() }))
    expect(session.records.length).toBe(500)
    expect(session.dropped).toBe(6)
    expect(session.records.at(-1)!.generation).toBe(1)
    for (let i = 0; i < 80; i++)
      source.onRequestFinished.fire(request({ request: { url: `https://example.com/${'x'.repeat(32000)}?id=${i}` }, startedDateTime: new Date(Date.now() + i).toISOString() }))
    expect(session.metadataBytes).toBeLessThanOrEqual(NETWORK_LIMITS.metadataBytes)
    expect(session.records.length).toBeLessThan(500)
  })
})
describe('来源关联使用独立构造的证据', () => {
  function fixture() {
    const { source, session } = start()
    source.onRequestFinished.fire(request())
    const record = session.records[0]!
    const text = '[{"data":1},"payload"]'
    const app: CollectedApp = { id: 'app:0', label: 'app', declaredId: 'app', serverRendered: true, externalUrl: record.url, sources: [{ kind: 'external', url: record.url, text, bytes: 22, fetchedAt: 13000, transport: 'extension-fetch' }] }
    const snapshot: PageSnapshot = { pageUrl: 'https://example.com/page', initialUrl: 'https://example.com/page', title: '', collectedAt: 13000, navigationStartedAt: 10000, apps: [app], warnings: [] }
    return { record, app, snapshot, body: { text, bytes: 22, encoding: 'text' } }
  }
  it('只有完整 URL、文档／导航和全文都一致才确认为内容已核对', () => {
    const { record, app, snapshot, body } = fixture()
    expect(associate(record, body, snapshot, app, 'document1').level).toBe('内容已核对')
    expect(associate(record, undefined, snapshot, app, 'document1').level).toBe('来源候选')
    expect(associate(record, { ...body, text: 'different' }, snapshot, app, 'document1').level).toBe('来源候选')
    expect(associate(record, body, snapshot, app, null).level).toBe('来源候选')
    expect(associate(record, body, snapshot, app, 'other-document').level).toBe('来源候选')
    expect(associate({ ...record, pageStartedAt: 1 }, body, snapshot, app, 'document1').level).toBe('来源候选')
    expect(associate({ ...record, url: record.url.replace('?q=1', '?q=2') }, body, snapshot, app, 'document1').level).toBe('无法关联')
    expect(associate({ ...record, redirectUrl: '/redirect' }, body, snapshot, app, 'document1').level).toBe('来源候选')
  })
  it('相似 JSON 不推断来源，业务标记明确为人工候选；响应快照不覆盖原采集', () => {
    const { record, app, snapshot, body } = fixture()
    const business: NetworkRecord = { ...record, url: 'https://example.com/api/products', manualCandidate: true }
    expect(associate(business, body, snapshot, app, 'document1').level).toBe('业务候选')
    const response = responseSnapshot(record, body, snapshot)
    expect(response.app.sources[0]!.transport).toBe('devtools-response')
    expect(response.snapshot.initialUrl).toBeNull()
    expect(app.sources[0]!.transport).toBe('extension-fetch')
    expect(response.snapshot.snapshotId).not.toBe(snapshot.snapshotId)
  })
})
