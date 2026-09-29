import type { FieldPath } from '../inspection/model'
import type { PayloadSession } from './useWorkbenchIndex'
import type { ToastInput } from '@/composables/useToast'
import type { FieldDetail } from '@/workers/protocol'
import { onScopeDispose, ref, shallowRef, watch } from 'vue'

export interface FieldDetailData {
  path: FieldPath
  detail: FieldDetail | null
  loading: boolean
  error: string
  sourceLabels: string[]
  watchedPaths: ReadonlySet<string>
  pendingWatchPaths: ReadonlySet<string>
}

export function useFieldDetails(index: PayloadSession, notice: (notice: ToastInput) => void) {
  const detail = shallowRef<FieldDetail | null>(null)
  const detailPath = shallowRef<FieldPath>([])
  const detailLocation = ref<string | null>(null)
  const detailLoading = ref(false)
  const detailError = ref('')
  let request = 0
  function closeDetail() {
    // 关闭后迟到的结果不能重新展开界面。
    request++
    detail.value = null
    detailLocation.value = null
    detailLoading.value = false
    detailError.value = ''
  }
  watch(index.generation, closeDetail, { flush: 'sync' })
  onScopeDispose(closeDetail)
  async function locate(path: FieldPath, location: string | null = null) {
    if (!index.ready.value) {
      notice({ message: '索引尚未就绪，请等待或重新建立索引。', kind: 'warning' })
      return
    }
    const current = ++request
    detailPath.value = JSON.parse(JSON.stringify(path))
    detailLocation.value = location
    detail.value = null
    detailError.value = ''
    detailLoading.value = true
    try {
      const value = await index.call('detail', JSON.parse(JSON.stringify(path)))
      if (current === request)
        detail.value = value
    }
    catch (failure) {
      if (current === request)
        detailError.value = failure instanceof Error ? failure.message : String(failure)
    }
    finally {
      if (current === request)
        detailLoading.value = false
    }
  }
  function toggleInlineDetail(location: string, path: FieldPath) {
    if (detailLocation.value === location)
      closeDetail()
    else
      void locate(path, location)
  }
  function sourceLabel(id: string | null) {
    const source = index.ready.value?.metrics.find(item => item.sourceId === id)
    return source ? `${source.kind === 'inline' ? '内嵌' : '外部'} · ${source.transport}` : '来源未确认'
  }
  return { detail, detailPath, detailLocation, detailLoading, detailError, closeDetail, locate, toggleInlineDetail, sourceLabel }
}
