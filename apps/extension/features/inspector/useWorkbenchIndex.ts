import type { CollectedApp, PageSnapshot } from '../nuxt/types'
import { computed, onScopeDispose, ref, toRaw, watch } from 'vue'
import { usePayloadWorker } from '@/composables/usePayloadWorker'
import { scopeFor } from '../watch/model'

export interface WorkbenchInput {
  app: () => CollectedApp | undefined
  snapshot: () => PageSnapshot | null | undefined
  tabId: () => number | null | undefined
  status: () => string
}

/** 每次重建或取消先递增版本，使已排队的业务响应立即失效。 */
export function useWorkbenchIndex(input: WorkbenchInput) {
  const worker = usePayloadWorker()
  const sourceMode = ref<number | null>(null)
  const generation = ref(0)
  onScopeDispose(() => {
    generation.value++
  })
  const scope = computed(() => scopeFor(input.snapshot(), input.app(), true))
  const snapshotKey = computed(() => {
    const snapshot = input.snapshot()
    return snapshot && input.app() ? `${snapshot.snapshotId ?? snapshot.collectedAt}:${input.app()!.id}:${sourceMode.value ?? 'merged'}` : ''
  })
  const contextKey = computed(() => {
    const selected = sourceMode.value === null ? null : input.app()?.sources[sourceMode.value]
    return `${input.tabId()}:${scope.value?.origin}:${scope.value?.pathname}:${scope.value?.app}:${selected ? `${selected.kind}:${selected.url}:${selected.transport}` : 'merged'}`
  })
  watch(() => input.app()?.sources, (sources) => {
    if (sources && sourceMode.value !== null && !sources[sourceMode.value])
      sourceMode.value = null
  }, { flush: 'sync' })
  async function start() {
    generation.value++
    const app = input.app()
    if (!app || input.status() !== 'ready') {
      worker.stop('等待成功采集新快照。')
      return
    }
    await worker.initialize(toRaw(app), snapshotKey.value, sourceMode.value)
  }
  function cancel() {
    generation.value++
    worker.stop()
  }
  return { ...worker, start, cancel, sourceMode, generation, scope, snapshotKey, contextKey }
}
export type WorkbenchIndex = ReturnType<typeof useWorkbenchIndex>
export type PayloadSession = Pick<WorkbenchIndex, 'ready' | 'pending' | 'generation' | 'call'>
