import type { Definition, WatchRule } from '../features/watch/model'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h } from 'vue'
import { useDefinitions } from '../composables/useDefinitions'
import { DEFINITION_PREFIX } from '../features/watch/model'
import { mutateDefinition } from '../features/watch/storage'

vi.mock('../libs/messaging', () => ({ sendMessage: vi.fn() }))
const scope = { origin: 'https://example.com', pathname: '/', app: 'nuxt', query: null }
function rule(id: string): WatchRule {
  return { version: 1, kind: 'watch', id, name: id, scope, path: [{ kind: 'property', key: 'data' }], createdAt: 1 }
}
const renderer = createRenderer<object, object>({ patchProp() {
}, insert() {
}, remove() {
}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}), setText() {
}, setElementText() {
}, parentNode: () => null, nextSibling: () => null })
const unmount: (() => void)[] = []
afterEach(() => {
  for (const stop of unmount.splice(0))
    stop()
  vi.unstubAllGlobals()
})
describe('定义持久化与初始化竞争', () => {
  it('并发保存独立规则不覆盖，同范围 50 条限额由后台串行执行', async () => {
    const stored: Record<string, Definition> = {}
    vi.stubGlobal('browser', { storage: { local: { get: async () => ({ ...stored }), set: async (value: Record<string, Definition>) => {
      for (const [key, definition] of Object.entries(value))
        stored[key] = { ...definition, scope: { app: definition.scope.app, origin: definition.scope.origin, pathname: definition.scope.pathname, query: definition.scope.query } }
    }, remove: async (key: string) => {
      delete stored[key]
    } } } })
    await Promise.all(Array.from({ length: 50 }, (_, i) => mutateDefinition({ action: 'save', definition: rule(`rule-${i}`) })))
    expect(Object.keys(stored)).toHaveLength(50)
    await expect(mutateDefinition({ action: 'save', definition: rule('overflow') })).rejects.toThrow('上限')
    await mutateDefinition({ action: 'delete', id: 'rule-0' })
    await mutateDefinition({ action: 'save', definition: rule('replacement') })
    expect(Object.keys(stored)).toHaveLength(50)
    expect(JSON.stringify(stored)).not.toContain('canonical')
  })
  it('本地规则晚加载不能覆盖期间的 storage 变更，损坏记录会提示', async () => {
    let listener: (changes: Record<string, {
      newValue?: unknown
    }>, area: string) => void = () => {
    }
    let resolveInitial: (value: Record<string, unknown>) => void = () => {
    }
    const stored = { [`${DEFINITION_PREFIX}fresh`]: rule('fresh'), [`${DEFINITION_PREFIX}bad`]: { version: 99 } }
    const get = vi.fn().mockImplementationOnce(() => new Promise((resolve) => {
      resolveInitial = resolve
    })).mockResolvedValue(stored)
    vi.stubGlobal('browser', { storage: { local: { get }, onChanged: { addListener: (fn: typeof listener) => {
      listener = fn
    }, removeListener: vi.fn() } } })
    let state!: ReturnType<typeof useDefinitions>
    const app = renderer.createApp(defineComponent({ setup() {
      state = useDefinitions()
      return () => h('div')
    } }))
    app.mount({})
    unmount.push(() => app.unmount())
    listener({ [`${DEFINITION_PREFIX}fresh`]: { newValue: rule('fresh') } }, 'local')
    resolveInitial({ [`${DEFINITION_PREFIX}old`]: rule('old') })
    await vi.waitFor(() => expect(state.definitions.value.map(item => item.id)).toEqual(['fresh']))
    await vi.waitFor(() => expect(state.storageNotice.value).toContain('损坏'))
  })
})
