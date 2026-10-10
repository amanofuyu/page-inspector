import type { CrawlResponse } from '../features/nuxt/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, nextTick, ref } from 'vue'
import { useInspection } from '../composables/useInspection'

const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }))
vi.mock('../libs/messaging', () => ({ sendMessage }))
const renderer = createRenderer<object, object>({ patchProp() {}, insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}), setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null })
let app: ReturnType<typeof renderer.createApp>
let state: ReturnType<typeof useInspection>
const active = ref(false)
let collectable = true
const pending: ((value: CrawlResponse) => void)[] = []
function response(requestId: string): CrawlResponse {
  return { tabId: 1, documentId: requestId, requestId, status: 'empty', snapshot: null }
}
beforeEach(async () => {
  vi.useFakeTimers()
  pending.length = 0
  active.value = false
  collectable = true
  sendMessage.mockImplementation((operation, request) => {
    if (operation === 'cancelCrawl')
      return Promise.resolve()
    return new Promise((resolve) => {
      pending.push(value => resolve({ ...value, requestId: request.requestId }))
    })
  })
  const event = { addListener: vi.fn(), removeListener: vi.fn() }
  vi.stubGlobal('browser', { tabs: { get: vi.fn(async () => ({ id: 1, url: 'https://example.com/', status: 'complete' })), onActivated: event, onUpdated: event, onRemoved: event } })
  app = renderer.createApp(defineComponent({ setup() {
    state = useInspection({ tabId: 1 }, () => active.value, () => collectable)
    return () => null
  } }))
  app.mount({})
  await vi.advanceTimersByTimeAsync(0)
})
afterEach(() => {
  app.unmount()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('只读工作区的采集生命周期', () => {
  it('非数据页取得标签页上下文但不采集，切回后才读取', async () => {
    expect(state.tabId.value).toBe(1)
    expect(state.currentUrl.value).toBe('https://example.com/')
    expect(sendMessage).not.toHaveBeenCalled()
    active.value = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(0)
    expect(pending).toHaveLength(1)
    pending[0]!(response('当前文档'))
    await vi.advanceTimersByTimeAsync(0)
    expect(state.result.value?.documentId).toBe('当前文档')
  })
  it('离开数据页立即取消，旧响应不能覆盖重新进入后的结果', async () => {
    active.value = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(0)
    active.value = false
    await nextTick()
    expect(sendMessage.mock.calls.some(([operation]) => operation === 'cancelCrawl')).toBe(true)
    active.value = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(0)
    pending[1]!(response('新文档'))
    await vi.advanceTimersByTimeAsync(0)
    pending[0]!(response('旧文档'))
    await vi.advanceTimersByTimeAsync(0)
    expect(state.result.value?.documentId).toBe('新文档')
  })
  it('查看独立网络响应时切回数据页不启动页面采集', async () => {
    collectable = false
    active.value = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(0)
    expect(sendMessage).not.toHaveBeenCalled()
    expect(pending).toHaveLength(0)
  })
})
