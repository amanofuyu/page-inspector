import type { CrawlResponse } from '../features/nuxt/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h } from 'vue'
import { useInspection } from '../composables/useInspection'

const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }))
vi.mock('../libs/messaging', () => ({ sendMessage }))
function event() {
  const listeners = new Set<(...args: any[]) => void>()
  return { addListener: (listener: (...args: any[]) => void) => listeners.add(listener), removeListener: (listener: (...args: any[]) => void) => listeners.delete(listener), fire: (...args: any[]) => {
    for (const listener of listeners)
      listener(...args)
  }, listeners }
}
function response(tabId: number, requestId: string, initialUrl = 'https://example.com/'): CrawlResponse {
  return { tabId, requestId, documentId: `doc-${tabId}`, status: 'ready', snapshot: { pageUrl: 'https://example.com/', initialUrl, title: String(tabId), collectedAt: 0, apps: [], warnings: [] } }
}
// 使用 Vue 内存渲染器验证生命周期，不启动浏览器。
const renderer = createRenderer<object, object>({
  patchProp() { },
  insert() { },
  remove() { },
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText() { },
  setElementText() { },
  parentNode: () => null,
  nextSibling: () => null,
})
let state: ReturnType<typeof useInspection>
let app: ReturnType<typeof renderer.createApp>
let tabs: {
  onActivated: ReturnType<typeof event>
  onUpdated: ReturnType<typeof event>
  onRemoved: ReturnType<typeof event>
  query: ReturnType<typeof vi.fn>
}
let activeTab = 1
const pending: {
  tabId: number
  requestId: string
  resolve: (result: CrawlResponse) => void
}[] = []
beforeEach(async () => {
  activeTab = 1
  pending.length = 0
  tabs = { onActivated: event(), onUpdated: event(), onRemoved: event(), query: vi.fn(async () => [{ id: activeTab, url: 'https://example.com/', status: 'complete' }]) }
  vi.stubGlobal('browser', { windows: { getCurrent: async () => ({ id: 10 }) }, tabs })
  sendMessage.mockImplementation((kind, request) => kind === 'cancelCrawl' ? Promise.resolve() : new Promise(resolve => pending.push({ ...request, resolve })))
  app = renderer.createApp(defineComponent({ setup() {
    state = useInspection()
    return () => h('div')
  } }))
  app.mount({})
  await vi.waitFor(() => expect(pending).toHaveLength(1))
})
afterEach(() => {
  app.unmount()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('侧边栏结果归属', () => {
  it('切换标签页时慢响应不能覆盖新页，且只查询所在窗口', async () => {
    activeTab = 2
    tabs.onActivated.fire({ tabId: 2, windowId: 10 })
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    pending[1]!.resolve(response(2, pending[1]!.requestId))
    await vi.waitFor(() => expect(state.result.value?.tabId).toBe(2))
    pending[0]!.resolve(response(1, pending[0]!.requestId))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(state.result.value?.tabId).toBe(2)
    expect(tabs.query).toHaveBeenCalledWith({ active: true, windowId: 10 })
  })
  it('忽略其他窗口的标签页事件', async () => {
    tabs.onActivated.fire({ tabId: 9, windowId: 20 })
    pending[0]!.resolve(response(1, pending[0]!.requestId))
    await vi.waitFor(() => expect(state.status.value).toBe('ready'))
    expect(pending).toHaveLength(1)
  })
  it('同文档地址变化保留快照并明确标记过期', async () => {
    pending[0]!.resolve(response(1, pending[0]!.requestId))
    await vi.waitFor(() => expect(state.status.value).toBe('ready'))
    tabs.onUpdated.fire(1, { url: 'https://example.com/next' })
    expect(state.snapshotWarning.value).toContain('初始文档快照')
    expect(state.result.value?.tabId).toBe(1)
  })
  it('完整导航立即清除旧数据并重新读取', async () => {
    pending[0]!.resolve(response(1, pending[0]!.requestId))
    await vi.waitFor(() => expect(state.status.value).toBe('ready'))
    tabs.onUpdated.fire(1, { status: 'loading', url: 'https://example.com/next' })
    expect(state.result.value).toBeNull()
    expect(state.status.value).toBe('loading')
    await vi.waitFor(() => expect(pending).toHaveLength(2))
    pending[1]!.resolve(response(1, pending[1]!.requestId))
  })
  it('初始文档地址未知时不会宣称快照对应当前路由', async () => {
    const value = response(1, pending[0]!.requestId)
    value.snapshot!.initialUrl = null
    pending[0]!.resolve(value)
    await vi.waitFor(() => expect(state.status.value).toBe('ready'))
    expect(state.snapshotWarning.value).toContain('无法确认')
  })
  it('卸载清理事件与请求，晚到响应不能更新状态', async () => {
    app.unmount()
    expect(tabs.onActivated.listeners.size).toBe(0)
    expect(sendMessage).toHaveBeenCalledWith('cancelCrawl', expect.objectContaining({ requestId: pending[0]!.requestId }))
    pending[0]!.resolve(response(1, pending[0]!.requestId))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(state.result.value).toBeNull()
  })
})

describe('devTools 固定目标与侧栏共存', () => {
  it('固定使用 inspectedWindow 标签页，普通标签页激活不会改变归属', async () => {
    app.unmount()
    pending.length = 0
    const fixedGet = vi.fn(async (id: number) => ({ id, url: 'https://example.com/fixed', status: 'complete' }))
    Object.assign(tabs, { get: fixedGet })
    app = renderer.createApp(defineComponent({ setup() {
      state = useInspection({ tabId: 99 })
      return () => h('div')
    } }))
    app.mount({})
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    expect(pending[0]!.tabId).toBe(99)
    tabs.onActivated.fire({ tabId: 2, windowId: 10 })
    pending[0]!.resolve(response(99, pending[0]!.requestId))
    await vi.waitFor(() => expect(state.result.value?.tabId).toBe(99))
    expect(fixedGet).toHaveBeenCalledWith(99)
    expect(pending).toHaveLength(1)
    tabs.onUpdated.fire(2, { status: 'loading' })
    expect(state.status.value).toBe('ready')
  })
})

describe('重新读取的稳定加载反馈', () => {
  beforeEach(async () => {
    pending[0]!.resolve(response(1, pending[0]!.requestId))
    await vi.waitFor(() => expect(state.status.value).toBe('ready'))
    vi.useFakeTimers()
  })
  it('快速响应保留旧快照直到 400ms 后统一替换', async () => {
    const previous = state.result.value
    const task = state.refresh()
    await vi.advanceTimersByTimeAsync(0)
    pending[1]!.resolve(response(1, pending[1]!.requestId))
    await vi.advanceTimersByTimeAsync(399)
    expect(state.status.value).toBe('loading')
    expect(state.result.value).toBe(previous)
    await vi.advanceTimersByTimeAsync(1)
    await task
    expect(state.status.value).toBe('ready')
    expect(state.result.value?.requestId).toBe(pending[1]!.requestId)
  })
  it('慢请求完成后直接呈现，不额外叠加 400ms', async () => {
    const previous = state.result.value
    const task = state.refresh()
    await vi.advanceTimersByTimeAsync(700)
    expect(state.result.value).toBe(previous)
    pending[1]!.resolve(response(1, pending[1]!.requestId))
    await vi.advanceTimersByTimeAsync(0)
    await task
    expect(state.status.value).toBe('ready')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('失败也满足最短反馈时间，保留旧结果并允许重试', async () => {
    const previous = state.result.value
    const task = state.refresh()
    await vi.advanceTimersByTimeAsync(0)
    pending[1]!.resolve({ ...response(1, pending[1]!.requestId), status: 'error', snapshot: null, message: '暂时读取失败' })
    await vi.advanceTimersByTimeAsync(399)
    expect(state.status.value).toBe('loading')
    expect(state.message.value).toBe('')
    await vi.advanceTimersByTimeAsync(1)
    await task
    expect(state.status.value).toBe('error')
    expect(state.message.value).toBe('暂时读取失败')
    expect(state.result.value).toBe(previous)
    const retry = state.refresh()
    await vi.advanceTimersByTimeAsync(0)
    pending[2]!.resolve(response(1, pending[2]!.requestId))
    await vi.advanceTimersByTimeAsync(400)
    await retry
    expect(state.status.value).toBe('ready')
    expect(state.message.value).toBe('')
  })
  it('最短等待期间切换标签页立即清除旧结果，不能提交旧响应', async () => {
    const task = state.refresh()
    await vi.advanceTimersByTimeAsync(0)
    pending[1]!.resolve(response(1, pending[1]!.requestId))
    await vi.advanceTimersByTimeAsync(100)
    activeTab = 2
    tabs.onActivated.fire({ tabId: 2, windowId: 10 })
    expect(state.result.value).toBeNull()
    await vi.advanceTimersByTimeAsync(150)
    await task
    expect(state.result.value).toBeNull()
    pending[2]!.resolve(response(2, pending[2]!.requestId))
    await vi.advanceTimersByTimeAsync(250)
    expect(state.result.value?.tabId).toBe(2)
    expect(state.status.value).toBe('ready')
  })
  it('卸载取消最短等待并释放计时器', async () => {
    const previous = state.result.value
    const task = state.refresh()
    await vi.advanceTimersByTimeAsync(0)
    pending[1]!.resolve(response(1, pending[1]!.requestId))
    await vi.advanceTimersByTimeAsync(100)
    app.unmount()
    await task
    expect(vi.getTimerCount()).toBe(0)
    expect(state.result.value).toBe(previous)
  })
  it('导航加载中的空结果等待重试，不闪现空状态或重复追加最短等待', async () => {
    const previous = state.result.value
    tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com/', status: 'loading' }])
    const task = state.refresh()
    await vi.advanceTimersByTimeAsync(0)
    pending[1]!.resolve({ ...response(1, pending[1]!.requestId), status: 'empty' })
    await vi.advanceTimersByTimeAsync(499)
    expect(state.status.value).toBe('loading')
    expect(state.result.value).toBe(previous)
    expect(pending).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(pending).toHaveLength(3)
    pending[2]!.resolve(response(1, pending[2]!.requestId))
    await vi.advanceTimersByTimeAsync(0)
    await task
    expect(state.status.value).toBe('ready')
    expect(state.result.value?.requestId).toBe(pending[2]!.requestId)
  })
})
