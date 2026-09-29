import type { Ref } from 'vue'
import type { responseSnapshot } from '../network/session'
import type { CrawlResponse } from '../nuxt/types'
import { computed, ref, shallowRef, watch } from 'vue'

/** 页面快照与显式选择的网络响应是两种业务来源，只有这里决定当前数据源。 */
export function useSnapshotSelection(result: Ref<CrawlResponse | null>, pageStatus: Ref<'loading' | 'ready' | 'empty' | 'error'>) {
  const responseOverride = shallowRef<ReturnType<typeof responseSnapshot> | null>(null)
  const appIndex = ref(0)
  const resetRevision = ref(0)
  const snapshot = computed(() => responseOverride.value?.snapshot ?? result.value?.snapshot)
  const application = computed(() => snapshot.value?.apps[appIndex.value])
  const context = computed(() => `${responseOverride.value?.snapshot.snapshotId ?? result.value?.documentId ?? result.value?.requestId}:${application.value?.id}`)
  const status = computed(() => {
    if (responseOverride.value)
      return 'ready'
    if (result.value && (pageStatus.value === 'loading' || pageStatus.value === 'error'))
      return result.value.status === 'ready' ? 'ready' : 'empty'
    return pageStatus.value
  })
  let selectedDeclaredId: string | null = null
  watch(appIndex, () => {
    if (application.value && !responseOverride.value)
      selectedDeclaredId = application.value.declaredId ?? null
    resetRevision.value++
  })
  function selectPageApplication() {
    const apps = result.value?.snapshot?.apps ?? []
    const matching = selectedDeclaredId ? apps.filter(app => app.declaredId === selectedDeclaredId) : []
    appIndex.value = matching.length === 1 ? apps.indexOf(matching[0]!) : 0
    if (apps.length)
      selectedDeclaredId = apps[appIndex.value]?.declaredId ?? null
  }
  function inspectResponse(value: ReturnType<typeof responseSnapshot>) {
    responseOverride.value = value
    appIndex.value = 0
    resetRevision.value++
  }
  function returnToPageSnapshot() {
    responseOverride.value = null
    selectPageApplication()
    resetRevision.value++
  }
  watch(result, (next, previous) => {
    const sameDocument = next?.documentId && next.documentId === previous?.documentId && next.tabId === previous.tabId
    if (!responseOverride.value && sameDocument) {
      const previousApp = previous?.snapshot?.apps[appIndex.value]?.id
      selectPageApplication()
      if (application.value?.id !== previousApp)
        resetRevision.value++
    }
    else {
      returnToPageSnapshot()
    }
  })
  return { responseOverride, appIndex, snapshot, application, context, status, resetRevision, inspectResponse, returnToPageSnapshot }
}
