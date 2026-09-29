import type { SeoRaw } from '../features/seo/model'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, nextTick, ref } from 'vue'
import { useSeoInspection } from '../composables/useSeoInspection'

const { sendMessage } = vi.hoisted(() => ({
  sendMessage: vi.fn(async () => null),
}))
vi.mock('../libs/messaging', () => ({ sendMessage }))
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
          network: () => undefined,
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
  it('刷新捕获等待加载也有超时，取消后清理等待状态', async () => {
    resolve()
    await finish()
    await state.reloadAndCapture()
    for (const listener of listeners) listener(1, { status: 'loading' })
    expect(state.status.value).toBe('loading')
    await vi.advanceTimersByTimeAsync(20001)
    expect(state.status.value).toBe('error')
    expect(state.error.value).toContain('等待页面加载超时')
    await state.reloadAndCapture()
    state.cancel()
    await vi.advanceTimersByTimeAsync(20001)
    expect(state.status.value).toBe('idle')
    expect(state.error.value).toBe('')
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
  it('旧标签页的迟到刷新错误不能覆盖新标签页', async () => {
    resolve()
    await finish()
    let failReload!: (error: Error) => void
    vi.mocked(browser.tabs.reload).mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          failReload = reject
        }),
    )
    const loading = state.reloadAndCapture()
    target.value = 2
    await nextTick()
    await vi.advanceTimersByTimeAsync(0)
    resolve(1)
    await finish()
    failReload(new Error('旧页面刷新失败'))
    await loading
    expect(state.dom.value?.identity.tabId).toBe(2)
    expect(state.status.value).toBe('ready')
    expect(state.error.value).toBe('')
  })
})
