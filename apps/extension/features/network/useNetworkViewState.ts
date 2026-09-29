import type { CollectedApp, PageSnapshot } from '../nuxt/types'
import type { NetworkViewData } from './useNetworkSession'
import { computed, ref, watch } from 'vue'
import { associate } from './session'

export interface NetworkViewInput {
  session: NetworkViewData
  revision: number
  snapshot?: PageSnapshot | null
  app?: CollectedApp
  documentId?: string | null
}

/** 修订号驱动派生视图，组件只保存筛选条件、选中 ID 和预览上限。 */
export function useNetworkViewState(input: NetworkViewInput) {
  const selectedId = ref('')
  const filter = ref('')
  const previewLimit = ref(8000)
  const records = computed(() => {
    void input.revision
    return input.session.records.map(record => ({ record, association: associate(record, input.session.body(record.id), input.snapshot, input.app, input.documentId) }))
  })
  const rows = computed(() => records.value.filter(({ record }) => record.url.toLowerCase().includes(filter.value.toLowerCase())).slice().reverse())
  const selected = computed(() => records.value.find(({ record }) => record.id === selectedId.value))
  const body = computed(() => {
    void input.revision
    return selected.value ? input.session.body(selectedId.value) : undefined
  })
  watch(selected, (value) => {
    if (!value)
      selectedId.value = ''
  }, { flush: 'sync' })
  watch([selectedId, body], () => {
    previewLimit.value = 8000
  }, { flush: 'sync' })
  function choose(id: string) {
    if (records.value.some(({ record }) => record.id === id))
      selectedId.value = id
  }
  return { selectedId, filter, previewLimit, rows, selected, body, choose }
}
