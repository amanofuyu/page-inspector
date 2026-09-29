import type { WorkbenchIndex } from '../features/inspector/useWorkbenchIndex'
import type { CollectedApp, PageSnapshot } from '../features/nuxt/types'
import type { Definition, WatchValue } from '../features/watch/model'
import { afterEach, expect, it, vi } from 'vitest'
import { computed, effectScope, ref, shallowRef } from 'vue'
import { scopeFor } from '../features/watch/model'
import { useWatchRules } from '../features/watch/useWatchRules'

const definitions = shallowRef<Definition[]>([])
vi.mock('@/composables/useDefinitions', () => ({
  useDefinitions: () => ({ definitions, storageNotice: ref(''), save: vi.fn(), remove: vi.fn() }),
}))
const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))

it('导航期间的空快照不会清除关注基线，只有不同业务范围会重置比较', async () => {
  const scope = effectScope()
  scopes.push(scope)
  const app = shallowRef<CollectedApp | undefined>({ id: 'app', label: '应用', declaredId: 'app', serverRendered: true, externalUrl: null, sources: [] })
  const snapshot = shallowRef<PageSnapshot | null>({ pageUrl: 'https://example.com/', initialUrl: 'https://example.com/', title: '页面', collectedAt: 1, apps: [app.value!], warnings: [] })
  const value = scopeFor(snapshot.value, app.value)!
  definitions.value = [{ version: 1, kind: 'watch', id: 'rule', name: '价格', scope: value, path: [], createdAt: 1 }]
  const ready = shallowRef<WorkbenchIndex['ready']['value']>({ metrics: [], fieldSources: {}, parsedComplete: true, coverage: { status: 'complete', scanned: 1, reasons: [], nodeBudget: 100, depthBudget: 10, timeBudgetMs: 1000 } })
  const initialReady = ready.value
  const initialApp = app.value
  const call = vi.fn<WorkbenchIndex['call']>()
  const snapshotKey = ref('1')
  const index = { ready, call, generation: ref(1), scope: computed(() => scopeFor(snapshot.value, app.value, true)), snapshotKey: computed(() => snapshotKey.value), contextKey: computed(() => `${snapshot.value?.initialUrl}:${app.value?.id}`) }
  const rules = scope.run(() => useWatchRules(index, { app: () => app.value, snapshot: () => snapshot.value, tabId: () => 1, status: () => ready.value ? 'ready' : 'loading' }, vi.fn()))!
  const found = (type: string): WatchValue[] => [{ id: 'rule', presence: 'found', type, preview: '1', canonical: `${type}:1`, bytes: 1 }]
  call.mockResolvedValueOnce(found('number'))
  await rules.updateWatches()
  expect(rules.comparisons.value[0]?.status).toBe('首次出现')

  ready.value = null
  app.value = undefined
  index.generation.value++
  expect(rules.comparisons.value).toEqual([])
  app.value = initialApp
  snapshotKey.value = '2'
  index.generation.value++
  ready.value = initialReady
  call.mockResolvedValueOnce(found('string'))
  await rules.updateWatches()
  expect(rules.comparisons.value[0]?.status).toBe('类型变化')
  expect(rules.comparisons.value[0]?.previous?.type).toBe('number')

  ready.value = null
  snapshot.value = { ...snapshot.value!, initialUrl: 'https://example.com/other' }
  definitions.value = [{ ...definitions.value[0]!, scope: scopeFor(snapshot.value, app.value)! }]
  index.generation.value++
  snapshotKey.value = '3'
  ready.value = initialReady
  call.mockResolvedValueOnce(found('string'))
  await rules.updateWatches()
  expect(rules.comparisons.value[0]?.status).toBe('首次出现')
})
