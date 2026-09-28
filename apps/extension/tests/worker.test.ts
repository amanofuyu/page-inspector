import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h } from 'vue'
import { usePayloadWorker } from '../composables/usePayloadWorker'

const renderer = createRenderer<object, object>({ patchProp() {
}, insert() {
}, remove() {
}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}), setText() {
}, setElementText() {
}, parentNode: () => null, nextSibling: () => null })
class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: {
    data: unknown
  }) => void) | null = null

  onerror: (() => void) | null = null
  requests: {
    id: number
    snapshot: string
    operation: string
  }[] = []

  terminated = false
  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(request: typeof this.requests[number]) {
    this.requests.push(request)
  }

  terminate() {
    this.terminated = true
  }

  respond(index: number, output: unknown) {
    this.onmessage?.({ data: { ...this.requests[index], output } })
  }
}
const apps: {
  unmount: () => void
}[] = []
function mount() {
  vi.stubGlobal('Worker', FakeWorker)
  let state!: ReturnType<typeof usePayloadWorker>
  const app = renderer.createApp(defineComponent({ setup() {
    state = usePayloadWorker()
    return () => h('div')
  } }))
  app.mount({})
  apps.push(app)
  return state
}
const app = { id: 'app', label: 'app', serverRendered: true, externalUrl: null, sources: [] }
const ready = { coverage: { status: 'complete', scanned: 1, nodeBudget: 100000, depthBudget: 100, timeBudgetMs: 2000, reasons: [] }, metrics: [], fieldSources: {}, parsedComplete: true }
afterEach(() => {
  for (const app of apps.splice(0))
    app.unmount()
  FakeWorker.instances = []
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('worker 身份与取消', () => {
  it('旧索引和旧查询晚到不能写入新快照', async () => {
    const state = mount()
    const first = state.initialize(app, 'first', null)
    const old = FakeWorker.instances[0]!
    const next = state.initialize(app, 'next', null)
    const current = FakeWorker.instances[1]!
    old.respond(0, { ...ready, fieldSources: { old: ['old'] } })
    current.respond(0, ready)
    await Promise.all([first, next])
    expect(old.terminated).toBe(true)
    expect(state.ready.value?.fieldSources).toEqual({})
    const task = state.call('analyze', undefined)
    const failure = expect(task).rejects.toThrow('任务已取消')
    state.stop()
    old.respond(1, { wrong: true })
    await failure
    expect(state.ready.value).toBeNull()
    expect(state.pending.value).toBe(0)
  })
  it('硬超时终止解析 Worker，卸载会拒绝所有待完成任务', async () => {
    vi.useFakeTimers()
    const state = mount()
    const first = state.initialize(app, 'first', null)
    await vi.advanceTimersByTimeAsync(8000)
    await first
    expect(FakeWorker.instances[0]!.terminated).toBe(true)
    expect(state.error.value).toContain('8 秒')
    const second = state.initialize(app, 'next', null)
    const current = FakeWorker.instances[1]!
    current.respond(0, ready)
    await second
    const task = state.call('analyze', undefined)
    const failed = expect(task).rejects.toThrow('面板已关闭')
    apps[0]!.unmount()
    await failed
    expect(current.terminated).toBe(true)
  })
})
