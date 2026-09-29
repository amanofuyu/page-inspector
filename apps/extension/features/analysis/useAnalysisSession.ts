import type { PayloadSession } from '../inspector/useWorkbenchIndex'
import type { ToastInput } from '@/composables/useToast'
import type { WorkerOperations } from '@/workers/protocol'
import { shallowRef, watch } from 'vue'

export function useAnalysisSession(index: PayloadSession, notice: (notice: ToastInput) => void) {
  const analysis = shallowRef<WorkerOperations['analyze']['output'] | null>(null)
  watch(index.generation, () => {
    analysis.value = null
  }, { flush: 'sync' })
  async function analyze() {
    if (!index.ready.value || index.pending.value)
      return
    const generation = index.generation.value
    try {
      const value = await index.call('analyze', undefined)
      if (generation === index.generation.value)
        analysis.value = value
    }
    catch (failure) {
      if (generation === index.generation.value)
        notice({ message: failure instanceof Error ? failure.message : String(failure), kind: 'error' })
    }
  }
  return { analysis, analyze }
}
