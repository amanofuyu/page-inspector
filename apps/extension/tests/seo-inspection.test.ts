import type { NetworkSession } from '../features/network/session'
import type { SeoRaw } from '../features/seo/model'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, nextTick, ref } from 'vue'
import { useSeoInspection } from '../composables/useSeoInspection'
import { parseSeoHtml } from '../features/seo/parse-html'

const { readNavigationHtml, navigationCandidate, parseHtmlWorker } = vi.hoisted(() => ({ readNavigationHtml: vi.fn(), navigationCandidate: vi.fn(), parseHtmlWorker: vi.fn() }))
vi.mock('../features/seo/sources', () => ({ readNavigationHtml, navigationCandidate }))
vi.mock('../features/seo/html-worker', () => ({ parseHtmlWorker }))

let network: NetworkSession | undefined

const renderer = createRenderer<object, object>({
  patchProp() {},
  insert() {},
  remove() {},
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText() {},
  setElementText() {},
  parentNode: () => null,
  nextSibling: () => null,
})
const listeners = new Set<
  (id: number, change: { status?: string, url?: string }) => void
>()
let state: ReturnType<typeof useSeoInspection>
let app: ReturnType<typeof renderer.createApp>
const target = ref<number | null>(1)
const active = ref(true)
let identity = { url: 'https://example.com/one', start: 10000 }
const pending: {
  tabId: number
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}[] = []
function raw(url = identity.url): SeoRaw {
  return {
    url,
    initialUrl: url,
    navigationStart: identity.start,
    sampledAt: 10010,
    complete: true,
    reasons: [],
    frames: 0,
    nodes: [{ tag: 'title', text: url, attrs: {}, location: 'head' }],
  }
}
function resolve(index = 0, documentId = `doc-${pending[index]!.tabId}`) {
  pending[index]!.resolve([{ frameId: 0, documentId, result: raw() }])
}
async function finish() {
  await vi.advanceTimersByTimeAsync(500)
}
beforeEach(async () => {
  vi.useFakeTimers()
  listeners.clear()
  pending.length = 0
  target.value = 1
  active.value = true
  identity = { url: 'https://example.com/one', start: 10000 }
  network = {} as NetworkSession
  navigationCandidate.mockReset()
  readNavigationHtml.mockImplementation(async (_network, identity) => ({ text: '<title>HTML 原始标题</title>', identity, url: identity.url, source: 'navigation-response', sampledAt: 1, status: 200, headers: [] }))
  parseHtmlWorker.mockImplementation(async input => parseSeoHtml(input))
  vi.stubGlobal('browser', {
    tabs: {
      get: vi.fn(async () => ({ url: identity.url })),
      reload: vi.fn(async () => {}),
      onUpdated: {
        addListener: (fn: any) => listeners.add(fn),
        removeListener: (fn: any) => listeners.delete(fn),
      },
    },
    scripting: {
      executeScript: vi.fn((options: any) =>
        options.target.documentIds
          ? Promise.resolve([{ result: identity }])
          : new Promise((resolve, reject) =>
              pending.push({ tabId: options.target.tabId, resolve, reject }),
            ),
      ),
    },
  })
  app = renderer.createApp(
    defineComponent({
      setup() {
        state = useSeoInspection({
          tabId: () => target.value,
          active: () => active.value,
          network: () => network,
        })
        return () => h('div')
      },
    }),
  )
  app.mount({})
  await vi.advanceTimersByTimeAsync(0)
})
afterEach(() => {
  app.unmount()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('sEO 独立采集生命周期', () => {
  it('dOM 自动采样不读取或解析网络正文，HTML 只在显式请求后取得', async () => {
    resolve()
    await finish()
    expect(readNavigationHtml).not.toHaveBeenCalled()
    expect(parseHtmlWorker).not.toHaveBeenCalled()
    const reading = state.refresh('html')
    await vi.advanceTimersByTimeAsync(0)
    resolve(1)
    await reading
    expect(state.html.value?.fields.find(field => field.key === 'title')?.value).toBe('HTML 原始标题')
    expect(readNavigationHtml).toHaveBeenCalledTimes(1)
  })
  it('取消 HTML 解析后迟到结果不能恢复旧内容，也不留下截止计时器', async () => {
    resolve()
    await finish()
    let complete!: (value: unknown) => void
    parseHtmlWorker.mockImplementationOnce(() => new Promise((resolve) => {
      complete = resolve
    }))
    const reading = state.refresh('html')
    await vi.advanceTimersByTimeAsync(0)
    resolve(1)
    await vi.advanceTimersByTimeAsync(0)
    state.cancel()
    complete({ source: 'navigation-response' })
    await reading
    expect(state.html.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('无需 Nuxt payload 即可采集，成功刷新前保留原有快照', async () => {
    resolve()
    await finish()
    expect(state.status.value).toBe('ready')
    expect(state.dom.value?.fields[0]?.value).toBe(identity.url)
    const previous = state.dom.value
    const refreshing = state.refresh()
    await vi.advanceTimersByTimeAsync(0)
    expect(state.dom.value).toBe(previous)
    pending[1]!.reject(new Error('页面读取失败'))
    await refreshing
    expect(state.status.value).toBe('error')
    expect(state.dom.value).toBe(previous)
  })
  it('当前 DOM 可使用唯一关联的已观察响应头，但不会因此读取正文', async () => {
    navigationCandidate.mockReturnValue({ id: '文档请求', status: 200 })
    network = { records: [], seoHeaders: () => [{ name: 'x-robots-tag', value: 'noindex' }] } as unknown as NetworkSession
    resolve()
    await finish()
    expect(state.dom.value?.fields.find(field => field.key === 'http:x-robots-tag')?.value).toBe('noindex')
    expect(state.dom.value?.requestId).toBe('文档请求')
    expect(readNavigationHtml).not.toHaveBeenCalled()
    expect(parseHtmlWorker).not.toHaveBeenCalled()
  })
  it('快速切换标签页，迟到结果不能覆盖当前页', async () => {
    target.value = 2
    await nextTick()
    await vi.advanceTimersByTimeAsync(0)
    expect(pending).toHaveLength(2)
    resolve(1)
    await finish()
    expect(state.dom.value?.identity.tabId).toBe(2)
    resolve(0)
    await finish()
    expect(state.dom.value?.identity.tabId).toBe(2)
  })
  it('sPA URL 变化立即清理旧基线，采样跟随新地址', async () => {
    resolve()
    await finish()
    identity.url = 'https://example.com/two'
    for (const listener of listeners) listener(1, { url: identity.url })
    expect(state.dom.value).toBeNull()
    expect(state.html.value).toBeNull()
    await finish()
    resolve(1)
    await finish()
    expect(state.dom.value?.identity.url).toBe(identity.url)
    expect(state.html.value).toBeNull()
  })
  it('导航发生在采样身份确认之前时拒绝该结果', async () => {
    resolve()
    identity = { url: 'https://example.com/new', start: 20000 }
    await finish()
    expect(state.dom.value).toBeNull()
    expect(state.error.value).toContain('页面已变化')
  })
  it('注入未返回也能超时退出，迟到结果不能恢复为成功', async () => {
    await vi.advanceTimersByTimeAsync(20001)
    expect(state.status.value).toBe('error')
    expect(state.error.value).toContain('超时')
    resolve()
    await finish()
    expect(state.dom.value).toBeNull()
  })
  it('卸载释放监听并拒绝迟到采集', async () => {
    app.unmount()
    expect(listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    resolve()
    await finish()
    expect(state.dom.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
