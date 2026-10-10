import type { NetworkViewData } from './useNetworkSession'
import { computed, ref, watch } from 'vue'

export interface NetworkViewInput { session: NetworkViewData, revision: number }

/** 元信息只做筛选；正文仅在选中请求时读取缓存。 */
export function useNetworkViewState(input: NetworkViewInput) {
  const selectedId = ref('')
  const filter = ref('')
  const previewLimit = ref(8000)
  const records = computed(() => {
    void input.revision
    return [...input.session.records]
  })
  const rows = computed(() => records.value.filter(record => record.url.toLowerCase().includes(filter.value.toLowerCase())).slice().reverse())
  const selected = computed(() => records.value.find(record => record.id === selectedId.value))
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
    if (records.value.some(record => record.id === id))
      selectedId.value = id
  }
  return { selectedId, filter, previewLimit, rows, selected, body, choose }
}
