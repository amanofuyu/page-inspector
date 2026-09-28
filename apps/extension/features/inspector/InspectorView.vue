<script lang="ts" setup>
import type { responseSnapshot } from '../network/session'
import { CircleAlert, Download, Info, LockKeyhole, RefreshCw, ScanLine, Search } from '@lucide/vue'
import { refDebounced } from '@vueuse/core'
import { computed, ref, shallowRef, watch } from 'vue'
import ThemeController from '@/components/theme-controller.vue'
import { useInspection } from '@/composables/useInspection'
import DataTreeNode from '@/features/inspector/DataTreeNode.vue'
import RawViewer from '@/features/inspector/RawViewer.vue'
import { buildPayloadView, exportNode, searchTree } from '@/features/nuxt/format'
import { parseApp } from '@/features/nuxt/parse'
import { unwrap } from '@/features/nuxt/types'
import NetworkView from '../network/NetworkView.vue'
import ExpandTransition from './ExpandTransition.vue'
import FeatureWorkbench from './FeatureWorkbench.vue'
import { vResizeMotion } from './motion'

const props = defineProps<{
  targetTabId?: number
  devtools?: boolean
}>()
const { result, status: pageStatus, message, currentUrl, snapshotWarning, refresh, tabId } = useInspection(props.targetTabId === undefined ? undefined : { tabId: props.targetTabId })
const activeFeature = ref('data')
const workbench = ref<InstanceType<typeof FeatureWorkbench> | null>(null)
const responseOverride = shallowRef<ReturnType<typeof responseSnapshot> | null>(null)
// 手动重读时继续展示当前快照，只有导航、空结果或成功的新快照会替换内容。
const status = computed(() => {
  if (responseOverride.value)
    return 'ready'
  if (result.value && (pageStatus.value === 'loading' || pageStatus.value === 'error'))
    return result.value.status === 'ready' ? 'ready' : 'empty'
  return pageStatus.value
})
const snapshot = computed(() => responseOverride.value?.snapshot ?? result.value?.snapshot)
const statusLabel = computed(() => responseOverride.value ? '浏览器响应' : ({ loading: '读取中', ready: '已采集', empty: '无数据', error: '读取失败' })[pageStatus.value])
const appIndex = ref(0)
const sourceIndex = ref(0)
const view = ref('data')
const query = ref('')
const search = refDebounced(query, 150)
const notice = ref('')
function inspectResponse(value: ReturnType<typeof responseSnapshot>) {
  responseOverride.value = value
  appIndex.value = 0
  sourceIndex.value = 0
  activeFeature.value = 'data'
  view.value = 'data'
  query.value = ''
  notice.value = ''
}
const application = computed(() => snapshot.value?.apps[appIndex.value])
const parsed = computed(() => application.value ? parseApp(application.value) : null)
const tree = computed(() => parsed.value?.payload ? buildPayloadView(parsed.value.payload, view.value) : null)
const source = computed(() => application.value?.sources[sourceIndex.value])
const views = [
  { id: 'data', label: '数据' },
  { id: 'state', label: '状态' },
  { id: '_errors', label: '错误' },
  { id: 'meta', label: '元信息' },
  { id: 'all', label: '全部' },
  { id: 'raw', label: '原文' },
]
const selectedNode = computed(() => tree.value?.root)
const found = computed(() => selectedNode.value ? searchTree(selectedNode.value, search.value) : { matches: [], limited: false })
const renderLabel = computed(() => {
  const value = unwrap(parsed.value?.payload?.serverRendered) ?? application.value?.serverRendered
  return value === true ? 'SSR / 预渲染快照' : value === false ? '客户端初始 payload' : '初始 payload · 渲染方式未知'
})
const totalBytes = computed(() => application.value?.sources.reduce((total, item) => total + item.bytes, 0) ?? 0)
function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`
}
function download(text: string, filename: string) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notice.value = '已发起下载'
  }
  catch {
    notice.value = '导出失败，请重试。'
  }
}
function exportCurrent() {
  if (view.value === 'raw' && source.value?.text !== null && source.value?.text !== undefined)
    download(source.value.text, `nuxt-${source.value.kind}-${Date.now()}.json`)
  else if (selectedNode.value)
    download(exportNode(selectedNode.value), `nuxt-${view.value}-${Date.now()}.json`)
}
let selectedDeclaredId: string | null = null
watch(appIndex, () => {
  if (application.value && !responseOverride.value)
    selectedDeclaredId = application.value.declaredId ?? null
})
function selectPageApplication() {
  const apps = result.value?.snapshot?.apps ?? []
  const matching = selectedDeclaredId ? apps.filter(app => app.declaredId === selectedDeclaredId) : []
  appIndex.value = matching.length === 1 ? apps.indexOf(matching[0]!) : 0
  if (apps.length)
    selectedDeclaredId = apps[appIndex.value]?.declaredId ?? null
}
function returnToPageSnapshot() {
  if (responseOverride.value)
    activeFeature.value = 'data'
  responseOverride.value = null
  selectPageApplication()
  sourceIndex.value = 0
  query.value = ''
  notice.value = ''
}
watch(result, (next, previous) => {
  // 同一文档的手动重读保留搜索与来源选择；导航和独立响应切换仍重置视图。
  const sameDocument = next?.documentId && next.documentId === previous?.documentId && next.tabId === previous.tabId
  if (!responseOverride.value && sameDocument) {
    const previousApp = previous?.snapshot?.apps[appIndex.value]?.id
    selectPageApplication()
    if (application.value?.id !== previousApp) {
      sourceIndex.value = 0
      query.value = ''
    }
    else if (!application.value?.sources[sourceIndex.value]) {
      sourceIndex.value = 0
    }
    notice.value = ''
  }
  else {
    returnToPageSnapshot()
  }
})
watch(appIndex, () => {
  sourceIndex.value = 0
  query.value = ''
})
watch(view, () => {
  query.value = ''
  notice.value = ''
})
</script>

<template>
  <div class="inspector-shell" :class="{ 'devtools-shell': devtools }">
    <div class="inspector-ambience" aria-hidden="true" />
    <header class="app-header">
      <div class="brand">
        <img class="brand-icon" src="/icon.svg" width="36" height="36" alt="" aria-hidden="true">
        <div>
          <h1>Page Inspector</h1>
          <p>NUXT PAYLOAD EXPLORER</p>
        </div>
      </div>
      <ThemeController />
    </header>
    <main class="inspector-main">
      <section class="page-card glass-card" aria-label="当前页面">
        <div class="section-heading">
          <span class="eyebrow">当前页面</span>
          <span v-resize-motion.inline="statusLabel" class="capture-status" :data-status="responseOverride ? status : pageStatus" role="status">
            <span class="status-dot" aria-hidden="true" />{{ statusLabel }}
          </span>
        </div>
        <h2 class="page-title" :title="snapshot?.title">
          {{ snapshot?.title || 'Nuxt 数据查看器' }}
        </h2>
        <p class="page-url" :title="currentUrl">
          {{ currentUrl || '等待当前标签页…' }}
        </p>
        <div class="page-actions">
          <span class="capture-time">{{ snapshot ? `${new Date(snapshot.collectedAt).toLocaleTimeString()} 采集` : '读取当前标签页的初始数据' }}</span>
          <button class="btn btn-sm btn-ghost refresh-button" :disabled="pageStatus === 'loading'" @click="refresh">
            <RefreshCw :size="14" :class="{ 'animate-spin': pageStatus === 'loading' }" aria-hidden="true" />{{ pageStatus === 'loading' ? '读取中' : '重新读取' }}
          </button>
        </div>
        <p v-if="pageStatus === 'error' && result && !responseOverride" class="refresh-error" role="alert">
          重新读取失败，仍显示上次结果：{{ message }}
        </p>
      </section>

      <nav class="workspace-tabs glass-card" aria-label="工作区">
        <button v-for="item in [{ id: 'data', label: '数据' }, { id: 'analysis', label: '分析' }, { id: 'query', label: '检索' }, { id: 'watch', label: '关注' }]" :key="item.id" :aria-pressed="activeFeature === item.id" :class="{ active: activeFeature === item.id }" @click="activeFeature = item.id">
          {{ item.label }}
        </button><button v-if="devtools" :aria-pressed="activeFeature === 'network'" :class="{ active: activeFeature === 'network' }" @click="activeFeature = 'network'">
          网络
        </button>
      </nav>
      <section v-if="status === 'loading'" class="empty-state glass-card" role="status">
        <span class="empty-state-icon"><span class="loading loading-spinner loading-md" /></span>
        <h2>正在读取页面数据</h2>
        <p>检测内嵌数据并读取页面声明的外部 payload。</p>
      </section>
      <section v-else-if="status === 'error'" class="empty-state empty-state-error glass-card" role="alert">
        <span class="empty-state-icon"><CircleAlert :size="28" :stroke-width="1.5" aria-hidden="true" /></span>
        <h2>暂时无法读取</h2>
        <p>{{ message }}</p>
        <button class="btn btn-sm btn-primary" @click="refresh">
          重试
        </button>
      </section>
      <section v-else-if="status === 'empty'" class="empty-state glass-card">
        <span class="empty-state-icon"><ScanLine :size="28" :stroke-width="1.5" aria-hidden="true" /></span>
        <h2>未检测到 Nuxt 数据</h2>
        <p>当前文档中没有支持的 Nuxt JSON payload 节点。页面加载完成后可重新读取。</p>
      </section>
      <template v-else-if="application && parsed">
        <p v-if="snapshotWarning && !responseOverride" class="notice notice-warning" role="status">
          {{ snapshotWarning }}
        </p>
        <p v-for="warning in snapshot?.warnings" :key="warning" class="notice notice-warning">
          {{ warning }}
        </p>
        <label v-if="snapshot && snapshot.apps.length > 1" class="field-label">
          应用
          <select v-model="appIndex" class="select select-sm w-full">
            <option v-for="(app, index) in snapshot.apps" :key="app.id" :value="index">{{ app.label }}</option>
          </select>
        </label>
        <details v-show="activeFeature === 'data'" class="source-details glass-card">
          <summary>数据来源与范围</summary>
          <p>初始文档：{{ snapshot?.initialUrl || '无法确认' }}</p>
          <div v-for="(item, index) in application.sources" :key="index" class="source-item">
            <strong>{{ item.kind === 'inline' ? '页面内嵌' : '外部 payload' }}</strong>
            <p>{{ item.url || '当前文档' }}</p>
            <small>{{ new Date(item.fetchedAt).toLocaleString() }} · {{ size(item.bytes) }}</small>
          </div>
          <p v-if="application.externalUrl">
            外部资源为本次重新获取，无法保证与最初 HTML 的版本完全一致。
          </p>
          <p>仅展示初始 payload，不包含页面运行时状态和独立运行时配置。</p>
        </details>
      </template>
      <p v-if="responseOverride" class="notice notice-warning">
        当前查看显式选择的浏览器响应。<button class="btn btn-xs btn-ghost" @click="returnToPageSnapshot">
          返回页面快照
        </button>
      </p>
      <NetworkView v-if="devtools" :active="activeFeature === 'network'" :snapshot="result?.snapshot" :app="result?.snapshot?.apps[appIndex]" :document-id="result?.documentId" :tab-id="targetTabId" @notice="notice = $event" @inspect="inspectResponse" />
      <FeatureWorkbench ref="workbench" :aria-busy="pageStatus === 'loading' && !responseOverride" :app="application" :snapshot="snapshot" :tab-id="tabId" :status="status" :active="activeFeature" @notice="notice = $event" @activate="activeFeature = $event">
        <template #data="{ watchedPaths, pendingWatchPaths }">
          <section v-if="application && parsed" v-show="activeFeature === 'data'" v-resize-motion="`${view}:${!!search.trim()}`" class="data-card glass-card" aria-label="Payload 数据">
            <div class="data-heading">
              <div class="data-intro">
                <span class="eyebrow">PAYLOAD</span>
                <h2 class="data-label">
                  {{ renderLabel }}
                </h2>
              </div>
              <div class="payload-metric">
                <p class="payload-size">
                  {{ size(totalBytes) }}
                </p>
                <p class="metric-caption">
                  采集原文 · {{ application.sources.length }} 个来源
                </p>
              </div>
            </div>
            <div v-if="parsed.diagnostics.length" class="diagnostics" role="status">
              <p v-for="diagnostic in parsed.diagnostics" :key="diagnostic">
                {{ diagnostic }}
              </p>
            </div>
            <nav class="view-tabs" aria-label="数据分类">
              <button v-for="item in views" :key="item.id" :class="{ active: view === item.id }" :aria-pressed="view === item.id" @click="view = item.id">
                {{ item.label }}
              </button>
            </nav>
            <div class="viewer-toolbar">
              <label v-if="view !== 'raw'" class="search-input">
                <Search :size="15" aria-hidden="true" />
                <input v-model="query" type="search" placeholder="搜索键、值或类型" aria-label="搜索当前分类" :disabled="!selectedNode">
              </label>
              <select v-else v-model="sourceIndex" class="select select-sm flex-1 min-w-0" aria-label="原文来源">
                <option v-for="(item, index) in application.sources" :key="index" :value="index">
                  {{ item.kind === 'inline' ? '内嵌原文' : '外部原文' }}
                </option>
              </select>
              <button class="btn btn-ghost btn-sm export-button" :disabled="view === 'raw' ? source?.text == null : !selectedNode" :title="view === 'raw' ? '导出完整已采集原文' : '导出带类型的当前视图'" @click="exportCurrent">
                <Download :size="14" aria-hidden="true" />导出
              </button>
            </div>
            <aside v-if="tree?.truncated && view !== 'raw'" class="view-limit-notice" role="status" aria-label="视图限制提示">
              <Info class="view-limit-icon" :size="16" aria-hidden="true" />
              <div class="view-limit-content">
                <div class="view-limit-heading">
                  <h3>视图已达展示上限</h3>
                  <span class="view-limit-threshold">已限制为 <strong>10,000</strong> 个节点 / <strong>60</strong> 层</span>
                </div>
                <p>搜索与视图导出仅包含已展示的数据，完整已采集内容请导出原文。</p>
              </div>
            </aside>
            <RawViewer v-if="view === 'raw' && source" :source="source" />
            <div v-else-if="!selectedNode" class="empty-section">
              <p>{{ parsed.payload ? '此 payload 没有该字段。' : '数据暂时无法解析，请切换到原文查看。' }}</p>
              <button v-if="!parsed.payload" class="btn btn-ghost btn-xs mt-2" @click="view = 'raw'">
                查看原文
              </button>
            </div>
            <div v-else-if="search.trim()" class="search-results">
              <p class="result-count" role="status">
                {{ found.matches.length }} 条匹配{{ found.limited ? '（仅显示前 100 条）' : '' }}
              </p>
              <div v-for="node in found.matches" :key="node.path" class="search-result">
                <p class="result-path">
                  {{ node.path }}
                </p>
                <DataTreeNode :node="node" :watched-paths="watchedPaths" :pending-watch-paths="pendingWatchPaths" @notice="notice = $event" @watch="workbench?.toggleWatch($event)" @locate="workbench?.locate($event)" />
              </div>
              <p v-if="!found.matches.length" class="empty-section">
                没有匹配的字段，试试其他关键词。
              </p>
            </div>
            <div v-else class="tree-container">
              <DataTreeNode :key="`${responseOverride?.snapshot.snapshotId ?? result?.documentId ?? result?.requestId}:${application.id}:${view}`" :node="selectedNode" initial-open :watched-paths="watchedPaths" :pending-watch-paths="pendingWatchPaths" @notice="notice = $event" @watch="workbench?.toggleWatch($event)" @locate="workbench?.locate($event)" />
            </div>
            <p class="export-note">
              视图导出保留类型与引用标记；原文导出保留采集文本。
            </p>
          </section>
        </template>
      </FeatureWorkbench>
      <ExpandTransition>
        <p v-if="notice" class="notice" role="status">
          {{ notice }}
        </p>
      </ExpandTransition>
    </main>
    <footer class="app-footer">
      <span>NUXT 3 / 4</span>
      <span class="privacy-note"><LockKeyhole :size="11" aria-hidden="true" />数据仅在本地查看</span>
    </footer>
  </div>
</template>
