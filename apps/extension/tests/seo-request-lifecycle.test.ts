import type { SeoHeaderSample } from '../features/seo/requests'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, shallowRef } from 'vue'
import { parseSeoHtml } from '../features/seo/parse-html'
import { useSeoRequests } from '../features/seo/useSeoRequests'

const { requestSeoHeaders, requestHreflang } = vi.hoisted(() => ({ requestSeoHeaders: vi.fn(), requestHreflang: vi.fn() }))
vi.mock('../features/seo/requests', () => ({ requestSeoHeaders, requestHreflang }))
const renderer = createRenderer<object, object>({ patchProp() {}, insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}), setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null })
const url = 'https://example.com/'
function snapshot() {
  return parseSeoHtml({ text: '<link rel="alternate" hreflang="fr" href="/fr"><link rel="alternate" hreflang="de" href="/de"><link rel="alternate" hreflang="es" href="/es"><link rel="alternate" hreflang="it" href="/it">', url, identity: { tabId: 1, documentId: '文档', url, initialUrl: url, navigationStart: 1 }, source: 'navigation-response', sampledAt: 1, status: 200, headers: [] })
}
let state: ReturnType<typeof useSeoRequests>
let app: ReturnType<typeof renderer.createApp>
const source = shallowRef(snapshot())
const active = shallowRef(true)
beforeEach(() => {
  vi.useFakeTimers()
  requestSeoHeaders.mockReset()
  requestHreflang.mockReset()
  source.value = snapshot()
  active.value = true
  app = renderer.createApp(defineComponent({
    setup() {
      state = useSeoRequests(() => source.value, () => active.value)
      return () => h('div')
    },
  }))
  app.mount({})
})
afterEach(() => {
  app.unmount()
  vi.useRealTimers()
})

describe('页面 SEO 额外请求的采样与取消边界', () => {
  it('挂载不请求网络，重采样和离开工作区取消请求并释放计时器', async () => {
    expect(requestSeoHeaders).not.toHaveBeenCalled()
    expect(requestHreflang).not.toHaveBeenCalled()
    let complete!: (value: SeoHeaderSample) => void
    requestSeoHeaders.mockImplementationOnce(() => new Promise(resolve => complete = resolve))
    const request = state.readHeaders()
    const signal = requestSeoHeaders.mock.calls[0]![1] as AbortSignal
    source.value = snapshot()
    expect(signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    complete({ url, status: 200, headers: [], sampledAt: 1 })
    await request
    expect(state.headers.value.value).toBeNull()
    requestSeoHeaders.mockImplementationOnce(() => new Promise(() => {}))
    void state.readHeaders()
    active.value = false
    expect(state.headers.value.loading).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('超时即时结束忙碌状态，旧请求的迟到失败不能覆盖重试结果', async () => {
    let reject!: (error: Error) => void
    requestSeoHeaders.mockImplementationOnce(() => new Promise((_resolve, fail) => reject = fail))
    const old = state.readHeaders()
    await vi.advanceTimersByTimeAsync(15001)
    expect(state.headers.value.error).toContain('超时')
    expect(state.headers.value.loading).toBe(false)
    requestSeoHeaders.mockResolvedValueOnce({ url, status: 200, headers: [], sampledAt: 2 })
    await state.readHeaders()
    reject(new Error('旧请求失败'))
    await old
    expect(state.headers.value.value?.sampledAt).toBe(2)
    expect(state.headers.value.error).toBe('')
  })

  it('最多同时处理三个请求，截断或不存在的 hreflang 不能启动请求', () => {
    requestHreflang.mockImplementation(() => new Promise(() => {}))
    const fields = source.value.fields.filter(field => field.group === 'languages')
    void state.checkHreflang('不存在')
    fields[0]!.truncated = true
    void state.checkHreflang(fields[0]!.id)
    expect(requestHreflang).not.toHaveBeenCalled()
    fields[0]!.truncated = false
    for (const field of fields)
      void state.checkHreflang(field.id)
    expect(requestHreflang).toHaveBeenCalledTimes(3)
    state.cancel()
    expect(vi.getTimerCount()).toBe(0)
    expect(Object.values(state.references.value).every(reference => !reference.loading)).toBe(true)
  })
})
