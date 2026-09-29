import type { Ref } from 'vue'
import type { CollectedApp } from '../nuxt/types'
import type { UiSplitPaneSize } from '@/components/ui/split-pane'
import { refDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { buildPayloadView, searchTree } from '../nuxt/format'
import { parseApp } from '../nuxt/parse'
import { unwrap } from '../nuxt/types'
import { useDataSelection } from './useDataSelection'

export const PAYLOAD_VIEWS = [
  { id: 'data', label: '数据' },
  { id: 'state', label: '状态' },
  { id: '_errors', label: '错误' },
  { id: 'meta', label: '元信息' },
  { id: 'all', label: '全部' },
  { id: 'raw', label: '原文' },
]

/** 视图只保存交互偏好，树、搜索结果和当前节点都从最新业务数据派生。 */
export function usePayloadViewState(application: Ref<CollectedApp | undefined>, context: Ref<string>, resetRevision: Ref<number>) {
  const sourceIndex = ref(0)
  const view = ref('data')
  const query = ref('')
  const splitSize = ref<UiSplitPaneSize>({ horizontal: 64, vertical: 50 })
  const search = refDebounced(query, 150)
  const parsed = computed(() => application.value ? parseApp(application.value) : null)
  const tree = computed(() => parsed.value?.payload ? buildPayloadView(parsed.value.payload, view.value) : null)
  const source = computed(() => application.value?.sources[sourceIndex.value])
  const selectedNode = computed(() => tree.value?.root)
  const selectionContext = computed(() => `${context.value}:${view.value}`)
  const { selected: focusedNode, visible: detailVisible, select: selectNode } = useDataSelection(selectedNode, selectionContext)
  const found = computed(() => selectedNode.value ? searchTree(selectedNode.value, search.value) : { matches: [], limited: false })
  const renderLabel = computed(() => {
    const value = unwrap(parsed.value?.payload?.serverRendered) ?? application.value?.serverRendered
    return value === true ? 'SSR / 预渲染快照' : value === false ? '客户端初始 payload' : '初始 payload · 渲染方式未知'
  })
  watch(resetRevision, () => {
    sourceIndex.value = 0
    query.value = ''
  }, { flush: 'sync' })
  watch(() => application.value?.sources, (sources) => {
    if (!sources?.[sourceIndex.value])
      sourceIndex.value = 0
  }, { flush: 'sync' })
  watch(view, () => {
    query.value = ''
  })
  return { sourceIndex, view, query, splitSize, search, parsed, tree, source, selectedNode, selectionContext, focusedNode, detailVisible, selectNode, found, renderLabel }
}
