import type { PageSnapshot } from '../nuxt/types'
import type { NetworkApi } from './session'
import type { ToastInput } from '@/composables/useToast'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useArtifactActions } from '@/composables/useArtifactActions'
import { parseApp } from '../nuxt/parse'
import { NetworkSession, responseSnapshot } from './session'

export type NetworkViewData = Readonly<Pick<NetworkSession, 'records' | 'body' | 'observedAt' | 'preserve' | 'metadataBytes' | 'bodyBytes' | 'dropped'>>

/** 网络会话由工作区容器持有，多个视图共享同一来源，不通过组件实例取数据。 */
export function useNetworkSession(options: {
  enabled: boolean
  documentId: () => string | null | undefined
  snapshot: () => PageSnapshot | null | undefined
  notice: (value: ToastInput) => void
}) {
  const revision = ref(0)
  const startupError = ref('')
  const session = options.enabled
    ? new NetworkSession(() => {
        revision.value++
      })
    : undefined
  watch(() => [options.documentId(), options.snapshot()?.navigationStartedAt] as const, ([documentId, startedAt]) => {
    if (documentId && startedAt !== undefined)
      session?.setDocument(documentId, startedAt)
  }, { immediate: true })
  onMounted(() => {
    if (!session)
      return
    if (!chrome.devtools?.network) {
      startupError.value = '网络观察仅可在真实开发者工具面板中使用。'
      return
    }
    session.start(chrome.devtools.network as unknown as NetworkApi)
  })
  onBeforeUnmount(() => session?.dispose())
  function toggleCandidate(id: string) {
    const record = session?.records.find(record => record.id === id)
    if (!record)
      return
    record.manualCandidate = !record.manualCandidate
    revision.value++
  }
  function setPreserve(value: boolean) {
    if (session) {
      session.preserve = value
      revision.value++
    }
  }
  async function read(id: string) {
    try {
      await session?.read(id)
    }
    catch (failure) {
      options.notice({ message: failure instanceof Error ? failure.message : String(failure), kind: 'error' })
    }
  }
  function inspect(id: string) {
    const record = session?.records.find(record => record.id === id)
    const body = session?.body(id)
    if (!record || !body)
      return
    try {
      const next = responseSnapshot(record, body, options.snapshot())
      if (!parseApp(next.app).payload)
        throw new Error('响应不是支持的 Nuxt JSON payload，仍可查看正文。')
      return next
    }
    catch (failure) {
      options.notice({ message: failure instanceof Error ? failure.message : String(failure), kind: 'error' })
    }
  }
  const artifacts = useArtifactActions(options.notice)
  function copyUrl(text: string) {
    return artifacts.copy(text, '已复制完整请求 URL')
  }
  function clear() {
    session?.clear()
  }
  function reload() {
    if (session)
      chrome.devtools.inspectedWindow.reload()
  }
  return { session, revision, startupError, toggleCandidate, setPreserve, read, inspect, copyUrl, clear, reload }
}
