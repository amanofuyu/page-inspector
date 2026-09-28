import { describe, expect, it, vi } from 'vitest'
import { readExternalPayload } from '../features/nuxt/external'

const controller = () => new AbortController()
describe('外部数据读取', () => {
  it('同源携带会话，跨域 CDN 不附带凭证', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response('[{}]', { headers: { 'content-type': 'application/json' } }))
    const a = await readExternalPayload('/_payload.json', 'https://example.com/page', 1000, controller().signal, fetcher)
    expect(a.text).toBe('[{}]')
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include', redirect: 'error', cache: 'no-cache' })
    await readExternalPayload('https://cdn.example.com/p.json', 'https://example.com', 1000, controller().signal, fetcher)
    expect(fetcher.mock.calls[1]?.[1].credentials).toBe('omit')
  })
  it.each([404, 500])('hTTP %s 保留错误信息', async (status) => {
    const result = await readExternalPayload('https://example.com/p.json', 'https://example.com', 100, controller().signal, vi.fn().mockResolvedValue(new Response('', { status })))
    expect(result.error).toContain(String(status))
    expect(result.text).toBeNull()
  })
  it('拒绝登录 HTML、非 HTTP 地址及网络失败', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('<html>', { headers: { 'content-type': 'text/html' } }))
    expect((await readExternalPayload('/p', 'https://example.com', 100, controller().signal, fetcher)).error).toContain('HTML')
    fetcher.mockClear()
    expect((await readExternalPayload('file:///tmp/test', 'https://example.com', 100, controller().signal, fetcher)).error).toContain('HTTP')
    expect(fetcher).not.toHaveBeenCalled()
    fetcher.mockRejectedValue(new TypeError('网络错误'))
    expect((await readExternalPayload('/p', 'https://example.com', 100, controller().signal, fetcher)).error).toContain('网络错误')
  })
  it('流式读取超过体积上限即取消', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream({ start(c) {
      c.enqueue(new Uint8Array(200))
    }, cancel })
    const result = await readExternalPayload('/p', 'https://example.com', 100, controller().signal, vi.fn().mockResolvedValue(new Response(body)))
    expect(result.text).toBeNull()
    expect(result.error).toContain('体积')
    expect(cancel).toHaveBeenCalled()
  })
  it('取消和超时不会丢失来源信息', async () => {
    const abort = controller()
    abort.abort()
    const result = await readExternalPayload('/p', 'https://example.com', 100, abort.signal, vi.fn().mockRejectedValue(new Error('aborted')))
    expect(result.error).toContain('取消或超时')
    expect(result.kind).toBe('external')
  })
})
