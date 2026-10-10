import type { SeoSnapshot } from './model'
import type { SeoHeaderSample, SeoReferenceResult } from './requests'
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { requestHreflang, requestSeoHeaders } from './requests'

interface RequestState<T> { loading: boolean, value: T | null, error: string }

/** 所有额外请求由用户操作启动；换页、重采样、切换来源或离开工作区时取消。 */
export function useSeoRequests(snapshot: () => SeoSnapshot | null, active: () => boolean) {
  const headers = shallowRef<RequestState<SeoHeaderSample>>({ loading: false, value: null, error: '' })
  const references = ref<Record<string, RequestState<SeoReferenceResult>>>({})
  const controllers = new Set<AbortController>()
  let generation = 0
  let disposed = false
  function cancel() {
    generation++
    for (const controller of controllers)
      controller.abort()
    controllers.clear()
    headers.value = { ...headers.value, loading: false }
    references.value = Object.fromEntries(Object.entries(references.value).map(([key, value]) => [key, { ...value, loading: false }]))
  }
  function reset() {
    cancel()
    headers.value = { loading: false, value: null, error: '' }
    references.value = {}
  }
  async function run<T>(operation: (source: SeoSnapshot, signal: AbortSignal) => Promise<T>, assign: (state: RequestState<T>) => void) {
    const source = snapshot()
    if (!source || !active() || disposed)
      return
    const ticket = generation
    const controller = new AbortController()
    controllers.add(controller)
    assign({ loading: true, value: null, error: '' })
    const timeout = setTimeout(() => {
      controller.abort()
      if (generation === ticket && !disposed)
        assign({ loading: false, value: null, error: '请求超时，请重试。' })
    }, 15000)
    const clearDeadline = () => {
      clearTimeout(timeout)
      controllers.delete(controller)
    }
    controller.signal.addEventListener('abort', clearDeadline, { once: true })
    try {
      const value = await operation(source, controller.signal)
      if (!controller.signal.aborted && generation === ticket && !disposed)
        assign({ loading: false, value, error: '' })
    }
    catch (error) {
      if (!controller.signal.aborted && generation === ticket && !disposed)
        assign({ loading: false, value: null, error: error instanceof Error ? error.message : String(error) })
    }
    finally {
      clearTimeout(timeout)
      controller.signal.removeEventListener('abort', clearDeadline)
      controllers.delete(controller)
    }
  }
  function readHeaders() {
    if (!headers.value.loading && controllers.size < 3)
      return run((source, signal) => requestSeoHeaders(source.url, signal), value => headers.value = value)
  }
  function checkHreflang(id: string) {
    const field = snapshot()?.fields.find(field => field.id === id && field.group === 'languages' && !field.truncated)
    if (field && !references.value[id]?.loading && controllers.size < 3)
      return run((source, signal) => requestHreflang(source, field.value, signal), value => references.value[id] = value)
  }
  watch(snapshot, reset, { flush: 'sync' })
  watch(active, (value) => {
    if (!value)
      cancel()
  }, { flush: 'sync' })
  onBeforeUnmount(() => {
    disposed = true
    cancel()
  })
  return { headers, references, readHeaders, checkHreflang, cancel }
}
