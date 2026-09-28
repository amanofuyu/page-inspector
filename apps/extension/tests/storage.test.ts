import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h } from 'vue'
import { useExtStorage } from '../composables/useExtStorage'

const { getValue, setValue, unwatch, watchStorage } = vi.hoisted(() => ({ getValue: vi.fn(), setValue: vi.fn(), unwatch: vi.fn(), watchStorage: vi.fn() }))
vi.mock('wxt/utils/storage', () => ({ storage: { defineItem: () => ({ getValue, setValue, watch: watchStorage }) } }))
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
let app: ReturnType<typeof renderer.createApp>
afterEach(() => {
  app?.unmount()
})
function mount() {
  let stored!: ReturnType<typeof useExtStorage<string | number | boolean>>
  watchStorage.mockReturnValue(unwatch)
  setValue.mockResolvedValue(undefined)
  app = renderer.createApp(defineComponent({ setup() {
    stored = useExtStorage<string | number | boolean>('local:test', 'default')
    return () => h('div')
  } }))
  app.mount({})
  return stored
}

describe('扩展存储', () => {
  it.each([false, 0, ''])('保留合法的假值：%s', async (value) => {
    getValue.mockResolvedValue(value)
    const stored = mount()
    await vi.waitFor(() => expect(stored.value).toBe(value))
    expect(setValue).not.toHaveBeenCalled()
  })
  it('迟到的初始化读取不会覆盖用户刚设置的值', async () => {
    let resolve!: (value: string) => void
    getValue.mockReturnValue(new Promise((done) => {
      resolve = done
    }))
    const stored = mount()
    stored.value = 'new'
    resolve('old')
    await Promise.resolve()
    expect(stored.value).toBe('new')
  })
  it('外部存储变化可同步到当前视图', async () => {
    getValue.mockResolvedValue('old')
    const stored = mount()
    await vi.waitFor(() => expect(stored.value).toBe('old'))
    watchStorage.mock.calls.at(-1)![0]('new')
    expect(stored.value).toBe('new')
  })
})
