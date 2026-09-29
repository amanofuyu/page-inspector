import type { PayloadSession } from '../inspector/useWorkbenchIndex'
import type { QueryResult, QuerySpec } from './engine'
import { onScopeDispose, ref, shallowRef, watch } from 'vue'

/** 编辑草稿不影响已提交条件；分页和导出始终对应同一次查询。 */
export function useQuerySession(index: PayloadSession) {
  const results = shallowRef<QueryResult | null>(null)
  const executedSpec = shallowRef<QuerySpec | null>(null)
  const queryError = ref('')
  let request = 0
  function reset() {
    request++
    results.value = null
    executedSpec.value = null
    queryError.value = ''
  }
  watch(index.generation, reset, { flush: 'sync' })
  onScopeDispose(reset)
  async function query(spec: QuerySpec, offset?: number) {
    if (!index.ready.value || index.pending.value)
      return
    const current = ++request
    const submitted: QuerySpec = JSON.parse(JSON.stringify(spec))
    queryError.value = ''
    if (offset === undefined) {
      results.value = null
      executedSpec.value = null
    }
    try {
      const result = offset === undefined ? await index.call('query', submitted) : await index.call('page', offset)
      if (current !== request)
        return
      results.value = result
      if (offset === undefined)
        executedSpec.value = submitted
    }
    catch (failure) {
      if (current !== request)
        return
      results.value = null
      executedSpec.value = null
      queryError.value = failure instanceof Error ? failure.message : String(failure)
    }
  }
  return { results, executedSpec, queryError, query }
}
