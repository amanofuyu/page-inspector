<script setup lang="ts">
import type { FieldPath } from '../inspection/model'
import type { DataNode } from '../nuxt/format'
import type { CollectedApp, PageSnapshot } from '../nuxt/types'
import type { ToastInput } from '@/composables/useToast'
import { RefreshCw } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import { useArtifactActions } from '@/composables/useArtifactActions'
import AnalysisView from '../analysis/AnalysisView.vue'
import { analysisReport } from '../analysis/report'
import { useAnalysisSession } from '../analysis/useAnalysisSession'
import { exactPath } from '../query/path'
import QueryView from '../query/QueryView.vue'
import { useQuerySession } from '../query/useQuerySession'
import { useWatchRules } from '../watch/useWatchRules'
import WatchView from '../watch/WatchView.vue'
import InlineFieldDetail from './components/InlineFieldDetail.vue'
import ExpandTransition from './ExpandTransition.vue'
import FieldDetailPanel from './FieldDetailPanel.vue'
import { vResizeMotion } from './motion'
import { useFieldDetails } from './useFieldDetails'
import { useWorkbenchIndex } from './useWorkbenchIndex'
import { useWorkbenchViewState } from './useWorkbenchViewState'

const props = defineProps<{
  app?: CollectedApp
  snapshot?: PageSnapshot | null
  tabId?: number | null
  active: string
  status: string
  dataNode?: DataNode
  dataDetailVisible?: boolean
}>()
const emit = defineEmits<{ notice: [notice: ToastInput] }>()
const notice = (value: ToastInput) => emit('notice', value)
const surface = ref<HTMLElement | null>(null)
const input = { app: () => props.app, snapshot: () => props.snapshot, tabId: () => props.tabId, status: () => props.status }
const index = useWorkbenchIndex(input)
const { ready, pending, error, sourceMode, scope, snapshotKey } = index
const { spec, queryName, watchDraft, rankingSort } = useWorkbenchViewState()
const analysisSession = useAnalysisSession(index, notice)
const { analysis } = analysisSession
const querySession = useQuerySession(index)
const { results, executedSpec, queryError } = querySession
const rules = useWatchRules(index, input, notice)
const { storageNotice, watches, watchedPaths, pendingWatchPaths, favorites, otherWatches, comparisons } = rules
const { detail, detailPath, detailLocation, detailLoading, detailError, closeDetail, locate, toggleInlineDetail, sourceLabel } = useFieldDetails(index, notice)
const artifacts = useArtifactActions(notice)
const detailProps = computed(() => ({
  path: detailPath.value,
  detail: detail.value,
  loading: detailLoading.value,
  error: detailError.value,
  sourceLabels: detail.value?.sourceIds.map(sourceLabel) ?? [],
  watchedPaths: watchedPaths.value,
  pendingWatchPaths: pendingWatchPaths.value,
}))
const sourceLabels = computed(() => Object.fromEntries(ready.value?.metrics.map(item => [item.sourceId, sourceLabel(item.sourceId)]) ?? []))
async function start() {
  const task = index.start()
  const generation = index.generation.value
  await task
  if (generation !== index.generation.value || !ready.value)
    return
  await rules.updateWatches()
  if (generation === index.generation.value && props.active === 'analysis')
    await analysisSession.analyze()
}
function analyze() {
  closeDetail()
  void analysisSession.analyze()
}
function query(offset?: number) {
  closeDetail()
  void querySession.query(spec.value, offset)
}
function toggleWatch(path: FieldPath) {
  void rules.changeWatch(path, { toggle: true, includeQuery: watchDraft.value.includeQuery })
}
async function addPath() {
  const draft = watchDraft.value
  try {
    const saved = await rules.changeWatch(exactPath(draft.path), { name: draft.name, includeQuery: draft.includeQuery })
    if (saved && watchDraft.value === draft)
      watchDraft.value = { ...draft, name: '' }
  }
  catch (failure) {
    notice({ message: failure instanceof Error ? failure.message : String(failure), kind: 'error' })
  }
}
async function saveQuery() {
  const name = queryName.value
  if (await rules.saveQuery(spec.value, name, watchDraft.value.includeQuery) && queryName.value === name)
    queryName.value = ''
}
function exportAnalysis() {
  if (ready.value && analysis.value)
    artifacts.downloadJson(analysisReport(snapshotKey.value, ready.value.metrics, analysis.value), 'payload-analysis')
}
function exportQuery() {
  if (results.value)
    artifacts.downloadJson({ format: 'page-inspector-query/v1', snapshotId: snapshotKey.value, query: executedSpec.value, ...results.value }, 'payload-query-page')
}
watch(snapshotKey, () => {
  void start()
}, { immediate: true })
watch(() => props.active, (value, previous) => {
  if (value !== previous) {
    closeDetail()
    surface.value?.scrollTo({ top: 0 })
  }
  if (value === 'data')
    sourceMode.value = null
  if (value === 'analysis' && !analysis.value)
    void analysisSession.analyze()
}, { flush: 'sync' })
watch([() => props.dataNode, () => props.dataDetailVisible, () => props.active, ready], () => {
  if (props.active !== 'data')
    return
  closeDetail()
  const path = props.dataNode?.fieldPath
  if (props.dataDetailVisible && path && path.at(-1)?.kind !== 'map-entry' && ready.value)
    void locate(path)
}, { flush: 'sync' })
</script>

<template>
  <section v-show="(active === 'data' && !!app && status === 'ready') || ['analysis', 'query', 'watch'].includes(active)" ref="surface" class="feature-card glass-card" :class="{ 'data-workbench': active === 'data' }" aria-label="扩展工作区">
    <div v-if="active !== 'data'" class="feature-toolbar">
      <label class="toolbar-field"><span class="toolbar-field-label">分析范围</span><select v-model="sourceMode" class="select select-sm" aria-label="分析来源"><option :value="null">合并后的应用</option><option v-for="(item, position) in app?.sources" :key="position" :value="position">来源 {{ position + 1 }} · {{ item.kind === 'inline' ? '内嵌' : '外部' }}</option></select></label>
      <UiActionButton v-if="pending" label="取消任务" size="sm" @click="index.cancel">
        取消任务
      </UiActionButton>
      <UiActionButton v-else label="重建索引" size="sm" @click="start">
        <RefreshCw :size="14" aria-hidden="true" />重建索引
      </UiActionButton>
    </div>
    <p v-if="active !== 'data'" class="feature-caption" role="status">
      {{ pending ? '正在处理…' : ready ? `索引 ${ready.coverage.scanned.toLocaleString()} 个节点 · ${ready.coverage.status === 'complete' ? '完整' : '部分覆盖'}` : error || '等待数据' }}<span v-if="ready?.coverage.reasons.length"> · {{ ready.coverage.reasons.join('；') }}</span>
    </p>
    <p v-if="storageNotice" class="notice notice-warning">
      {{ storageNotice }}
    </p>
    <div class="feature-columns">
      <div v-resize-motion="`${active}:${spec.conditions.length}:${results?.total}:${results?.offset}:${watches.length}`" class="feature-primary">
        <slot v-if="active === 'data'" name="data" :watched-paths="watchedPaths" :pending-watch-paths="pendingWatchPaths" :data-detail="detailProps" :toggle-watch="toggleWatch" />
        <AnalysisView v-if="active === 'analysis'" v-model:ranking-sort="rankingSort" :ready="ready" :pending="pending" :analysis="analysis" :detail-location="detailLocation" :watched-paths="watchedPaths" :pending-watch-paths="pendingWatchPaths" @analyze="analyze" @export="exportAnalysis" @detail="toggleInlineDetail" @watch="toggleWatch">
          <template #detail="{ location, id }">
            <InlineFieldDetail :id="id" :location="location" :selected="detailLocation" :data="detailProps" @close="closeDetail" @notice="notice" @watch="toggleWatch" @locate="locate" />
          </template>
        </AnalysisView>
        <QueryView v-else-if="active === 'query'" v-model:spec="spec" v-model:query-name="queryName" :ready="!!ready" :pending="pending" :can-save="!!scope" :query-error="queryError" :favorites="favorites" :results="results" :source-labels="sourceLabels" :detail-location="detailLocation" :watched-paths="watchedPaths" :pending-watch-paths="pendingWatchPaths" @query="query()" @page="query" @save="saveQuery" @remove="rules.removeRule" @export="exportQuery" @copy="artifacts.copy" @detail="toggleInlineDetail" @watch="toggleWatch">
          <template #detail="{ location, id }">
            <InlineFieldDetail :id="id" :location="location" :selected="detailLocation" :data="detailProps" @close="closeDetail" @notice="notice" @watch="toggleWatch" @locate="locate" />
          </template>
        </QueryView>
        <WatchView v-else-if="active === 'watch'" v-model:draft="watchDraft" :scope="scope" :watches="watches" :other-watches="otherWatches" :comparisons="comparisons" @add="addPath" @rename="rules.rename" @locate="locate" @remove="rules.removeRule" />
      </div>
      <ExpandTransition>
        <FieldDetailPanel v-if="active !== 'data' && detailLocation === null && (detail || detailLoading || detailError)" v-bind="detailProps" @close="closeDetail" @notice="notice" @watch="toggleWatch" @locate="locate" />
      </ExpandTransition>
    </div>
  </section>
</template>
