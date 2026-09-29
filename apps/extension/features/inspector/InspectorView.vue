<script lang="ts" setup>
import { Braces, ChartNoAxesColumnIncreasing, Globe, Network, ScanLine, Search, Star } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiNotice from '@/components/ui/UiNotice.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiTabPanel from '@/components/ui/UiTabPanel.vue'
import UiTabs from '@/components/ui/UiTabs.vue'
import { useArtifactActions } from '@/composables/useArtifactActions'
import { useInspection } from '@/composables/useInspection'
import { useSeoInspection } from '@/composables/useSeoInspection'
import { useToast } from '@/composables/useToast'
import { exportNode } from '@/features/nuxt/format'
import NetworkView from '../network/NetworkView.vue'
import { useNetworkSession } from '../network/useNetworkSession'
import SeoView from '../seo/SeoView.vue'
import { useSeoActions } from '../seo/useSeoActions'
import InspectorFooter from './components/InspectorFooter.vue'
import InspectorHeader from './components/InspectorHeader.vue'
import DataView from './DataView.vue'
import FeatureWorkbench from './FeatureWorkbench.vue'
import PageContextDialog from './PageContextDialog.vue'
import ToastNotice from './ToastNotice.vue'
import { usePayloadViewState } from './usePayloadViewState'
import { useSnapshotSelection } from './useSnapshotSelection'

const props = defineProps<{ targetTabId?: number, devtools?: boolean }>()
const { result, status: pageStatus, message, currentUrl, snapshotWarning, refresh, tabId } = useInspection(props.targetTabId === undefined ? undefined : { tabId: props.targetTabId })
const { toast, show: showNotice, dismiss: dismissNotice, pause: pauseNotice, resume: resumeNotice } = useToast()
const activeFeature = ref('data')
const contextOpen = ref(false)
const workspaces = computed(() => [
  { id: 'data', label: '数据', icon: Braces },
  { id: 'analysis', label: '分析', icon: ChartNoAxesColumnIncreasing },
  { id: 'query', label: '检索', icon: Search },
  { id: 'watch', label: '关注', icon: Star },
  { id: 'seo', label: 'SEO', icon: Globe },
  ...(props.devtools ? [{ id: 'network', label: '网络', icon: Network }] : []),
])
const selected = useSnapshotSelection(result, pageStatus)
const { responseOverride, appIndex, snapshot, application, status, context, resetRevision } = selected
const { sourceIndex, view, query, splitSize, search, parsed, tree, source, selectedNode, selectionContext, focusedNode, detailVisible, selectNode, found, renderLabel } = usePayloadViewState(application, context, resetRevision)
const artifacts = useArtifactActions(showNotice)
const seoVisited = ref(false)
const network = useNetworkSession({ enabled: !!props.devtools, documentId: () => result.value?.documentId, snapshot: () => result.value?.snapshot, notice: showNotice })
const { session: networkSession, revision: networkRevision, startupError: networkError } = network
const { dom: seoDom, html: seoHtml, status: seoStatus, error: seoError, sourceNotice: seoSourceNotice, refresh: refreshSeo, reloadAndCapture, cancel: cancelSeo } = useSeoInspection({
  tabId: () => tabId.value,
  active: () => activeFeature.value === 'seo',
  network: () => networkSession,
})
const seoActions = useSeoActions({ dom: () => seoDom.value, html: () => seoHtml.value }, showNotice)
const statusLabel = computed(() => activeFeature.value === 'seo' ? ({ idle: '等待采集', loading: '读取中', ready: 'SEO 已采集', error: '读取失败' })[seoStatus.value] : responseOverride.value ? '浏览器响应' : ({ loading: '读取中', ready: '已采集', empty: '无数据', error: '读取失败' })[pageStatus.value])
const pageTitle = computed(() => activeFeature.value === 'seo' ? seoDom.value?.fields.find(field => field.key === 'title')?.value || '页面 SEO 检查' : snapshot.value?.title || 'Nuxt 数据查看器')
const refreshing = computed(() => activeFeature.value === 'seo' ? seoStatus.value === 'loading' : pageStatus.value === 'loading')
const captureTime = computed(() => {
  const time = activeFeature.value === 'seo' ? seoDom.value?.sampledAt : snapshot.value?.collectedAt
  return time ? new Date(time).toLocaleTimeString() : ''
})
const totalBytes = computed(() => application.value?.sources.reduce((total, item) => total + item.bytes, 0) ?? 0)
function inspectNetwork(id: string) {
  const response = network.inspect(id)
  if (!response)
    return
  selected.inspectResponse(response)
  activeFeature.value = 'data'
  view.value = 'data'
  dismissNotice()
}
function returnToPageSnapshot() {
  if (responseOverride.value && activeFeature.value !== 'seo')
    activeFeature.value = 'data'
  selected.returnToPageSnapshot()
  dismissNotice()
}
function refreshCurrent() {
  if (activeFeature.value === 'seo')
    void refreshSeo()
  else
    void refresh()
}
function exportCurrent() {
  if (view.value === 'raw' && source.value?.text != null)
    artifacts.download(source.value.text, `nuxt-${source.value.kind}-${Date.now()}.json`)
  else if (selectedNode.value)
    artifacts.download(exportNode(selectedNode.value), `nuxt-${view.value}-${Date.now()}.json`)
}
watch(activeFeature, (value) => {
  if (value === 'seo')
    seoVisited.value = true
})
watch(responseOverride, (next, previous) => {
  if (previous && !next && activeFeature.value !== 'seo')
    activeFeature.value = 'data'
})
watch([result, view, resetRevision], dismissNotice)
</script>

<template>
  <UiTabs v-model="activeFeature" :items="workspaces">
    <div class="inspector-shell focus-layout" :class="{ 'devtools-shell': devtools }">
      <InspectorHeader :page-title="pageTitle" :current-url="currentUrl" :context-open="contextOpen" :refreshing="refreshing" @context="contextOpen = true" @refresh="refreshCurrent" />
      <PageContextDialog
        v-model:open="contextOpen" :title="pageTitle" :url="currentUrl" :capture-time="captureTime"
        :render-label="activeFeature !== 'seo' ? renderLabel : undefined"
        :application="activeFeature !== 'seo' ? application : undefined" :initial-url="snapshot?.initialUrl"
      />
      <UiTabPanel :value="activeFeature">
        <main class="inspector-main" :class="{ 'data-main': activeFeature === 'data' && application && parsed }">
          <div v-if="activeFeature !== 'seo'" class="inspector-context" :class="{ 'is-empty': activeFeature === 'data' && !application }">
            <UiNotice v-if="pageStatus === 'error' && result && !responseOverride" class="refresh-error" role="alert" severity="warning">
              重新读取失败，仍显示上次结果：{{ message }}
            </UiNotice>
            <UiEmptyState v-if="status === 'loading'" class="glass-card" size="panel" kind="loading" title="正在读取页面数据">
              检测内嵌数据并读取页面声明的外部 payload。
            </UiEmptyState>
            <UiEmptyState v-else-if="status === 'error'" class="glass-card" size="panel" kind="error" title="暂时无法读取">
              {{ message }}
              <template #actions>
                <UiActionButton size="sm" variant="primary" @click="refresh">
                  重试
                </UiActionButton>
              </template>
            </UiEmptyState>
            <UiEmptyState v-else-if="status === 'empty'" class="glass-card" size="panel" title="未检测到 Nuxt 数据">
              <template #icon>
                <ScanLine :size="28" :stroke-width="1.5" />
              </template>
              当前文档中没有支持的 Nuxt JSON payload 节点。页面加载完成后可重新读取。
            </UiEmptyState>
            <template v-else-if="application && parsed">
              <UiNotice v-if="snapshotWarning && !responseOverride" role="status" severity="warning">
                {{ snapshotWarning }}
              </UiNotice>
              <UiNotice v-for="warning in snapshot?.warnings" :key="warning" severity="warning">
                {{ warning }}
              </UiNotice>
              <div v-if="snapshot && snapshot.apps.length > 1" class="field-label">
                应用
                <UiSelect v-model="appIndex" :items="snapshot.apps.map((app, index) => ({ value: index, label: app.label }))" class="w-full" label="应用" />
              </div>
            </template>
            <UiNotice v-if="responseOverride" severity="warning">
              当前查看显式选择的浏览器响应。
              <template #actions>
                <UiActionButton @click="returnToPageSnapshot">
                  返回页面快照
                </UiActionButton>
              </template>
            </UiNotice>
          </div>
          <NetworkView v-if="networkSession" :session="networkSession" :revision="networkRevision" :startup-error="networkError" :active="activeFeature === 'network'" :snapshot="result?.snapshot" :app="result?.snapshot?.apps[appIndex]" :document-id="result?.documentId" :tab-id="targetTabId" @inspect="inspectNetwork" @candidate="network.toggleCandidate" @preserve="network.setPreserve" @read="network.read" @copy="network.copyUrl" @clear="network.clear" @reload="network.reload" />
          <SeoView v-if="seoVisited" :active="activeFeature === 'seo'" :dom="seoDom" :html="seoHtml" :status="seoStatus" :error="seoError" :source-notice="seoSourceNotice" :can-capture="!!networkSession" @refresh="refreshSeo" @reload="reloadAndCapture" @cancel="cancelSeo" @copy="seoActions.copy" @export="seoActions.download" />
          <FeatureWorkbench :aria-busy="pageStatus === 'loading' && !responseOverride" :app="application" :snapshot="snapshot" :tab-id="tabId" :status="status" :active="activeFeature" :data-node="focusedNode" :data-detail-visible="detailVisible && view !== 'raw'" @notice="showNotice">
            <template #data="{ watchedPaths, pendingWatchPaths, dataDetail, toggleWatch }">
              <DataView v-if="application && parsed" v-model:view="view" v-model:query="query" v-model:source-index="sourceIndex" v-model:detail-visible="detailVisible" v-model:split-size="splitSize" :application="application" :parsed="parsed" :tree="tree" :source="source" :selected-node="selectedNode" :focused-node="focusedNode" :search="search" :found="found" :selection-context="selectionContext" :data-detail="dataDetail" :watched-paths="watchedPaths" :pending-watch-paths="pendingWatchPaths" @export="exportCurrent" @select="selectNode" @notice="showNotice" @watch="toggleWatch" />
            </template>
          </FeatureWorkbench>
        </main>
      </UiTabPanel>
      <InspectorFooter :status="activeFeature === 'seo' ? seoStatus : responseOverride ? status : pageStatus" :status-label="statusLabel" :capture-time="captureTime" :context-open="contextOpen" :render-label="renderLabel" :total-bytes="totalBytes" :source-count="activeFeature !== 'seo' ? application?.sources.length : undefined" @context="contextOpen = true" />
      <ToastNotice :toast="toast" @dismiss="dismissNotice" @pause="pauseNotice" @resume="resumeNotice" />
    </div>
  </UiTabs>
</template>
