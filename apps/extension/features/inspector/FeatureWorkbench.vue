<script setup lang="ts">
import type { FieldDetail, WorkerOperations } from '../../workers/protocol'
import type { FieldPath } from '../inspection/model'
import type { CollectedApp, PageSnapshot } from '../nuxt/types'
import type { QueryCondition, QuerySpec } from '../query/engine'
import type { SavedQuery, WatchComparison, WatchRule } from '../watch/model'
import { Download, RefreshCw } from '@lucide/vue'
import { computed, ref, shallowRef, toRaw, watch } from 'vue'
import { useDefinitions } from '@/composables/useDefinitions'
import { usePayloadWorker } from '@/composables/usePayloadWorker'
import { analysisReport } from '../analysis/report'
import { exactPath, formatPath } from '../query/path'
import { matchesScope, scopeFor, WatchSession } from '../watch/model'
import DataTreeNode from './DataTreeNode.vue'
import WatchButton from './WatchButton.vue'

const props = defineProps<{
  app?: CollectedApp
  snapshot?: PageSnapshot | null
  tabId?: number | null
  active: string
  status: string
}>()
const emit = defineEmits<{
  notice: [
        message: string,
  ]
  activate: [
        view: string,
  ]
}>()
const worker = usePayloadWorker()
const { ready, pending, error } = worker
const { definitions, storageNotice, save, remove } = useDefinitions()
const sourceMode = ref<number | null>(null)
const includeQuery = ref(false)
const analysis = shallowRef<WorkerOperations['analyze']['output'] | null>(null)
const results = shallowRef<WorkerOperations['query']['output'] | null>(null)
const detail = shallowRef<FieldDetail | null>(null)
const comparisons = shallowRef<WatchComparison[]>([])
const executedSpec = shallowRef<QuerySpec | null>(null)
const queryName = ref('')
const watchPath = ref('')
const watchName = ref('')
const rankingSort = ref<'size' | 'path' | 'items'>('size')
const spec = ref<QuerySpec>({ combine: 'all', category: 'data', conditions: [{ field: 'path', op: 'eq', value: '*' }] })
const scope = computed(() => scopeFor(props.snapshot, props.app, true))
const applicable = computed(() => definitions.value.filter(rule => matchesScope(rule.scope, scope.value)))
const watches = computed(() => applicable.value.filter((rule): rule is WatchRule => rule.kind === 'watch'))
const watchedPaths = computed(() => new Set(watches.value.map(rule => formatPath(rule.path))))
const watchContext = computed(() => JSON.stringify(scope.value))
const pendingWatches = ref(new Map<string, { context: string, path: string }>())
const pendingWatchPaths = computed(() => new Set([...pendingWatches.value.values()].filter(item => item.context === watchContext.value).map(item => item.path)))
const favorites = computed(() => applicable.value.filter((rule): rule is SavedQuery => rule.kind === 'query'))
const otherWatches = computed(() => definitions.value.filter(rule => rule.kind === 'watch' && !matchesScope(rule.scope, scope.value)))
const snapshotKey = computed(() => props.snapshot && props.app ? `${props.snapshot.snapshotId ?? props.snapshot.collectedAt}:${props.app.id}:${sourceMode.value ?? 'merged'}` : '')
const selectedSource = computed(() => sourceMode.value === null ? null : props.app?.sources[sourceMode.value])
const contextKey = computed(() => `${props.tabId}:${scope.value?.origin}:${scope.value?.pathname}:${scope.value?.app}:${selectedSource.value ? `${selectedSource.value.kind}:${selectedSource.value.url}:${selectedSource.value.transport}` : 'merged'}`)
const rows = computed(() => [...analysis.value?.rows ?? []].sort((a, b) => rankingSort.value === 'path' ? a.path.localeCompare(b.path) : rankingSort.value === 'items' ? (b.itemCount ?? 0) - (a.itemCount ?? 0) : b.estimatedBytes - a.estimatedBytes))
const watchSession = new WatchSession()
let generation = 0
let watchRequest = 0
function size(bytes: number | null) {
  return bytes === null ? '未知' : bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1048576).toFixed(2)} MiB`
}
function reportError(failure: unknown) {
  emit('notice', failure instanceof Error ? failure.message : String(failure))
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}-${Date.now()}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function start() {
  const current = ++generation
  analysis.value = null
  results.value = null
  detail.value = null
  if (!props.app || props.status !== 'ready') {
    worker.stop('等待成功采集新快照。')
    return
  }
  watchSession.reset(contextKey.value)
  comparisons.value = []
  await worker.initialize(toRaw(props.app), snapshotKey.value, sourceMode.value)
  if (current === generation && ready.value) {
    await updateWatches()
    if (props.active === 'analysis')
      await analyze()
  }
}
async function analyze() {
  if (!ready.value || pending.value)
    return
  const current = generation
  try {
    const result = await worker.call('analyze', undefined)
    if (current === generation)
      analysis.value = result
  }
  catch (failure) {
    if (current === generation)
      reportError(failure)
  }
}
async function query(offset?: number) {
  const current = generation
  const submitted: QuerySpec = JSON.parse(JSON.stringify(spec.value))
  try {
    const result = offset === undefined ? await worker.call('query', submitted) : await worker.call('page', offset)
    if (current === generation) {
      results.value = result
      if (offset === undefined)
        executedSpec.value = submitted
    }
  }
  catch (failure) {
    if (current === generation)
      reportError(failure)
  }
}
async function locate(path: FieldPath) {
  if (!ready.value) {
    emit('notice', '索引尚未就绪，请等待或重新建立索引。')
    return
  }
  const current = generation
  try {
    const value = await worker.call('detail', JSON.parse(JSON.stringify(path)))
    if (current === generation)
      detail.value = value
  }
  catch (failure) {
    if (current === generation)
      reportError(failure)
  }
}
async function changeWatch(path: FieldPath, toggle = false) {
  const selected = scopeFor(props.snapshot, props.app, includeQuery.value)
  if (!selected) {
    emit('notice', '需要可确认的初始文档和唯一应用声明标识；当前应用不能自动绑定关注。')
    return
  }
  const key = formatPath(path)
  const context = watchContext.value
  const operation = `${context}:${key}`
  if (pendingWatches.value.has(operation))
    return
  const existing = watches.value.filter(rule => formatPath(rule.path) === key)
  if (existing.length && !toggle) {
    emit('notice', '该路径已关注。')
    return
  }
  pendingWatches.value.set(operation, { context, path: key })
  try {
    if (existing.length) {
      // 同一路径可能有多个适用规则，取消时一并移除，保证按钮与当前范围一致。
      for (const rule of existing)
        await remove(rule.id)
      emit('notice', '已取消关注字段。')
    }
    else {
      await save({ version: 1, kind: 'watch', id: crypto.randomUUID(), name: watchName.value.trim().slice(0, 160) || key.slice(0, 160), scope: selected, path: JSON.parse(JSON.stringify(path)), createdAt: Date.now() })
      emit('notice', '已关注字段；比较值仅保留在当前面板会话。')
      watchName.value = ''
    }
  }
  catch (failure) {
    reportError(failure)
  }
  finally {
    pendingWatches.value.delete(operation)
  }
}
function addWatch(path: FieldPath) {
  return changeWatch(path)
}
function toggleWatch(path: FieldPath) {
  return changeWatch(path, true)
}

function addPath() {
  try {
    void addWatch(exactPath(watchPath.value))
  }
  catch (failure) {
    reportError(failure)
  }
}
async function updateWatches() {
  if (!ready.value)
    return
  const current = generation
  const request = ++watchRequest
  try {
    const values = await worker.call('watches', JSON.parse(JSON.stringify(watches.value)))
    if (current === generation && request === watchRequest)
      comparisons.value = watchSession.update(snapshotKey.value, values)
  }
  catch (failure) {
    if (current === generation)
      reportError(failure)
  }
}
async function saveQuery() {
  const selected = scopeFor(props.snapshot, props.app, includeQuery.value)
  if (!selected) {
    emit('notice', '此应用没有可安全绑定的站点范围。')
    return
  }
  try {
    await save({ version: 1, kind: 'query', id: crypto.randomUUID(), name: queryName.value.trim().slice(0, 160) || '收藏查询', scope: selected, query: JSON.parse(JSON.stringify(spec.value)), createdAt: Date.now() })
    queryName.value = ''
  }
  catch (failure) {
    reportError(failure)
  }
}
async function removeRule(id: string) {
  try {
    await remove(id)
  }
  catch (failure) {
    reportError(failure)
  }
}
async function rename(rule: WatchRule, event: Event) {
  try {
    await save({ ...rule, name: (event.target as HTMLInputElement).value.slice(0, 160) })
  }
  catch (failure) {
    reportError(failure)
  }
}
async function copy(value: unknown) {
  try {
    await navigator.clipboard.writeText(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
    emit('notice', '已复制')
  }
  catch {
    emit('notice', '复制失败，请使用导出。')
  }
}
function comparison(id: string) {
  return comparisons.value.find(value => value.id === id)
}
function sourceLabel(id: string | null) {
  const source = ready.value?.metrics.find(item => item.sourceId === id)
  return source ? `${source.kind === 'inline' ? '内嵌' : '外部'} · ${source.transport}` : '来源未确认'
}
function operations(condition: QueryCondition) {
  return condition.field === 'path' ? ['eq', 'ne', 'exists', 'missing'] : condition.field === 'value' ? ['contains', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte'] : ['contains', 'eq', 'ne']
}
function changeField(condition: QueryCondition) {
  condition.op = condition.field === 'path' ? 'eq' : 'contains'
}
const labels: Record<string, string> = { contains: '包含', eq: '等于', ne: '不等于', gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于', exists: '路径存在', missing: '路径缺失' }
watch(snapshotKey, () => {
  void start()
}, { immediate: true })
watch(watches, () => {
  void updateWatches()
})
watch(() => props.active, (value) => {
  if (value === 'data' && sourceMode.value !== null)
    sourceMode.value = null
  if (value === 'analysis' && !analysis.value)
    void analyze()
})
defineExpose({ toggleWatch, locate })
</script>

<template>
  <section v-show="(active === 'data' && !!app && status === 'ready') || ['analysis', 'query', 'watch'].includes(active)" class="feature-card glass-card" :class="{ 'data-workbench': active === 'data' }" aria-label="扩展工作区">
    <div v-if="active !== 'data'" class="feature-toolbar">
      <label class="toolbar-field"><span class="toolbar-field-label">分析范围</span><select v-model="sourceMode" class="select select-sm" aria-label="分析来源"><option :value="null">合并后的应用</option><option v-for="(item, index) in app?.sources" :key="index" :value="index">来源 {{ index + 1 }} · {{ item.kind === 'inline' ? '内嵌' : '外部' }}</option></select></label>
      <button v-if="pending" class="btn btn-sm btn-ghost" @click="worker.stop()">
        取消任务
      </button>
      <button v-else class="btn btn-sm btn-ghost" @click="start">
        <RefreshCw :size="14" aria-hidden="true" />重建索引
      </button>
    </div>
    <p v-if="active !== 'data'" class="feature-caption" role="status">
      {{ pending ? '正在处理…' : ready ? `索引 ${ready.coverage.scanned.toLocaleString()} 个节点 · ${ready.coverage.status === 'complete' ? '完整' : '部分覆盖'}` : error || '等待数据' }}<span v-if="ready?.coverage.reasons.length"> · {{ ready.coverage.reasons.join('；') }}</span>
    </p>
    <p v-if="storageNotice" class="notice notice-warning">
      {{ storageNotice }}
    </p>
    <div class="feature-columns">
      <div class="feature-primary">
        <slot v-if="active === 'data'" name="data" :watched-paths="watchedPaths" :pending-watch-paths="pendingWatchPaths" />
        <template v-if="active === 'analysis'">
          <div class="feature-heading">
            <h2>原文体积与字段估算</h2><button class="btn btn-sm btn-ghost" :disabled="!ready || !!pending" @click="analyze">
              <RefreshCw :size="14" aria-hidden="true" />{{ analysis ? '重新分析' : '开始分析' }}
            </button>
          </div>
          <div class="metric-grid">
            <article v-for="item in ready?.metrics" :key="item.sourceId" class="metric-card">
              <span>{{ item.kind === 'inline' ? '内嵌原文' : '外部原文' }} · {{ item.transport }}</span><strong>{{ size(item.rawUtf8Bytes) }}</strong>
              <span>已采集原文 UTF-8 · {{ item.complete ? '完整取得' : '读取不完整' }} · {{ item.parseStatus }}</span>
              <details>
                <summary>来源度量</summary><p class="break-text">
                  {{ item.url }}
                </p><p>消息预算 {{ size(item.messageBytes) }} · 已读下界 {{ size(item.readBytesLowerBound) }}</p><p class="break-text">
                  SHA-256 {{ item.digest || '未知' }}
                </p><p v-if="item.error">
                  {{ item.error }}
                </p>
              </details>
            </article>
          </div>
          <template v-if="analysis">
            <p class="feature-caption">
              算法 {{ analysis.algorithm }} · {{ analysis.coverage.status === 'complete' ? '完整分析' : '部分分析' }} · {{ analysis.durationMs.toFixed(0) }} ms。字段独立估算，不可相加，也不代表压缩传输字节。
            </p>
            <p v-if="analysis.coverage.reasons.length" class="notice notice-warning">
              {{ analysis.coverage.reasons.join('；') }}
            </p>
            <div class="feature-toolbar">
              <label class="toolbar-field"><span class="toolbar-field-label">字段排名</span><select v-model="rankingSort" class="select select-sm" aria-label="排名排序"><option value="size">估算体积</option><option value="items">项数</option><option value="path">路径</option></select></label><button class="btn btn-sm btn-ghost" :disabled="!ready" @click="download(analysisReport(snapshotKey, ready!.metrics, analysis), 'payload-analysis')">
                <Download :size="14" aria-hidden="true" />导出分析报告
              </button>
            </div>
            <ol class="ranking-list">
              <li v-for="row in rows" :key="row.nodeId">
                <button class="ranking-row" @click="locate(row.fieldPath)">
                  <span class="mono break-text">{{ row.path }}</span><span>{{ row.type }} · {{ row.itemCount ?? '—' }} 项 · {{ row.complete ? '' : '≥ ' }}{{ size(row.estimatedBytes) }}<small v-if="row.references"> · {{ row.references }} 个引用</small></span><span class="ranking-track"><i :style="{ width: `${Math.max(1, row.estimatedBytes / Math.max(1, analysis.rows[0]?.estimatedBytes ?? 1) * 100)}%` }" /></span>
                </button><WatchButton :path="row.fieldPath" :watched="watchedPaths.has(formatPath(row.fieldPath))" :busy="pendingWatchPaths.has(formatPath(row.fieldPath))" @toggle="toggleWatch" />
              </li>
            </ol>
            <details class="distribution">
              <summary>内容分布 · {{ analysis.distribution.sharedEdges }} 条共享引用边</summary><p class="feature-caption">
                共享引用已节省重复序列化成本，不直接等同于应删除的数据。
              </p><h3>长字符串</h3><button v-for="item in analysis.distribution.strings" :key="item.nodeId" class="distribution-row" @click="locate(item.fieldPath)">
                {{ item.path }} · {{ item.length }} 字符
              </button><h3>大集合</h3><button v-for="item in analysis.distribution.collections" :key="item.nodeId" class="distribution-row" @click="locate(item.fieldPath)">
                {{ item.path }} · {{ item.itemCount }} 项
              </button><h3>深层结构</h3><button v-for="item in analysis.distribution.deep" :key="item.nodeId" class="distribution-row" @click="locate(item.fieldPath)">
                {{ item.path }} · {{ item.fieldPath.length }} 层
              </button>
            </details>
          </template>
        </template>
        <template v-else-if="active === 'query'">
          <div class="feature-heading">
            <h2>高级检索</h2><span class="feature-caption">独立索引 · 每页 50 条</span>
          </div>
          <div class="query-scope">
            <label class="toolbar-field"><span class="toolbar-field-label">分类</span><select v-model="spec.category" class="select select-sm" aria-label="查询分类"><option value="data">data</option><option value="state">state</option><option value="_errors">_errors</option><option value="meta">元信息</option><option value="app">整个应用</option></select></label><label class="toolbar-field"><span class="toolbar-field-label">条件组合</span><select v-model="spec.combine" class="select select-sm" aria-label="条件组合"><option value="all">全部满足</option><option value="any">任一满足</option></select></label>
          </div>
          <div v-for="(condition, index) in spec.conditions" :key="index" class="condition-row">
            <select v-model="condition.field" class="select select-sm" :aria-label="`条件 ${index + 1} 字段`" @change="changeField(condition)">
              <option value="path">
                路径
              </option><option value="key">
                键名
              </option><option value="value">
                值
              </option><option value="type">
                基础类型
              </option><option value="tag">
                Nuxt 标签
              </option>
            </select>
            <select v-model="condition.op" class="select select-sm" :aria-label="`条件 ${index + 1} 比较`">
              <option v-for="op in operations(condition)" :key="op" :value="op">
                {{ labels[op] }}
              </option>
            </select>
            <select v-if="condition.field === 'value'" v-model="condition.valueType" class="select select-sm" :aria-label="`条件 ${index + 1} 值类型`">
              <option :value="undefined">
                string
              </option><option v-for="type in ['number', 'boolean', 'null', 'undefined', 'bigint', 'empty']" :key="type" :value="type">
                {{ type }}
              </option>
            </select>
            <input v-model="condition.value" class="input input-sm" :aria-label="`条件 ${index + 1} 内容`" :placeholder="condition.field === 'path' ? 'products[*].price' : '比较值'">
            <button class="btn btn-xs btn-ghost" :aria-label="`删除条件 ${index + 1}`" @click="spec.conditions.splice(index, 1)">
              移除
            </button>
          </div>
          <p class="feature-caption">
            相对路径从所选分类开始；$ 表示应用根。支持 *、[*] 和 ["带点.的属性"]。数字值需要明确选择 number。
          </p>
          <div class="feature-toolbar">
            <button class="btn btn-sm btn-ghost" :disabled="spec.conditions.length >= 10" @click="spec.conditions.push({ field: 'value', op: 'eq', valueType: 'number', value: '' })">
              添加条件
            </button><button class="btn btn-sm btn-primary" :disabled="!ready || !!pending" @click="query()">
              执行查询
            </button>
          </div>
          <div class="favorite-editor">
            <input v-model="queryName" class="input input-sm" aria-label="查询名称" placeholder="查询名称"><button class="btn btn-sm btn-ghost" :disabled="!scope" @click="saveQuery">
              收藏条件
            </button>
          </div>
          <div v-for="favorite in favorites" :key="favorite.id" class="favorite-row">
            <button class="btn btn-xs btn-ghost" @click="spec = JSON.parse(JSON.stringify(favorite.query))">
              {{ favorite.name }}
            </button><button class="btn btn-xs btn-ghost" @click="removeRule(favorite.id)">
              删除
            </button>
          </div>
          <template v-if="results">
            <div class="feature-toolbar">
              <p class="feature-caption query-result-status" role="status">
                {{ results.total }} 条匹配 · {{ results.limited ? '达到 1,000 条展示上限' : results.coverage.status === 'complete' ? '扫描完整' : '仅代表已扫描范围，未匹配不等于不存在' }}
              </p><button class="btn btn-xs btn-ghost" @click="download({ format: 'page-inspector-query/v1', snapshotId: snapshotKey, query: executedSpec, ...results }, 'payload-query-page')">
                导出本页摘要
              </button>
            </div>
            <article v-for="match in results.matches" :key="match.path" class="query-result">
              <button class="path-button mono" @click="locate(match.fieldPath)">
                {{ match.path }}
              </button><p>{{ match.type }} · {{ match.preview }}</p><p class="feature-caption">
                {{ sourceLabel(match.sourceId) }} · {{ match.reasons.join('；') }}
              </p><div class="feature-toolbar">
                <button class="btn btn-xs btn-ghost" @click="copy(match)">
                  复制摘要
                </button><WatchButton :path="match.fieldPath" :watched="watchedPaths.has(formatPath(match.fieldPath))" :busy="pendingWatchPaths.has(formatPath(match.fieldPath))" @toggle="toggleWatch" />
              </div>
            </article>
            <div class="feature-toolbar">
              <button class="btn btn-sm btn-ghost" :disabled="results.offset === 0 || !!pending" @click="query(results.offset - 50)">
                上一页
              </button><span>{{ results.offset / 50 + 1 }} / {{ Math.max(1, Math.ceil(results.total / 50)) }}</span><button class="btn btn-sm btn-ghost" :disabled="results.offset + 50 >= results.total || !!pending" @click="query(results.offset + 50)">
                下一页
              </button>
            </div>
          </template>
        </template>
        <template v-else-if="active === 'watch'">
          <div class="feature-heading">
            <h2>字段关注</h2><span>{{ watches.length }} / 50</span>
          </div>
          <p class="feature-caption">
            仅比较相邻成功采集的初始 payload。基线只留在当前面板会话，关闭面板后清除。数组、Map 和 Set 按位置关注，重新排序会改变目标。
          </p>
          <p v-if="!scope" class="notice notice-warning">
            初始文档或唯一应用声明标识不可确认，请选择有唯一标识的应用后添加关注。
          </p>
          <p v-else class="feature-caption break-text">
            范围：{{ scope.origin }}{{ scope.pathname }} · 应用 {{ scope.app }}
          </p>
          <label class="checkbox-label"><input v-model="includeQuery" type="checkbox">新规则的作用域包含 URL 查询参数</label>
          <div class="watch-editor">
            <input v-model="watchPath" class="input input-sm" aria-label="关注路径" placeholder="$[&quot;data&quot;][&quot;products&quot;][0]"><input v-model="watchName" class="input input-sm" aria-label="关注别名" placeholder="别名（可选）"><button class="btn btn-sm btn-primary" :disabled="!scope" @click="addPath">
              添加关注
            </button>
          </div>
          <article v-for="rule in watches" :key="rule.id" class="watch-row">
            <div class="feature-toolbar">
              <input :value="rule.name" class="input input-sm" :aria-label="`重命名关注 ${rule.name}`" @change="rename(rule, $event)"><strong class="watch-status">{{ comparison(rule.id)?.status || '等待比较' }}</strong>
            </div><button class="path-button mono" @click="locate(rule.path)">
              {{ formatPath(rule.path) }}
            </button><p>当前：{{ comparison(rule.id)?.current.preview ?? '等待成功采集' }}</p><p class="feature-caption">
              上次：{{ comparison(rule.id)?.previous?.preview ?? '暂无基线' }} · {{ comparison(rule.id)?.current.type }}
            </p><p v-if="comparison(rule.id)?.current.reason" class="feature-caption">
              {{ comparison(rule.id)?.current.reason }}
            </p><button class="btn btn-xs btn-ghost" @click="removeRule(rule.id)">
              取消关注
            </button>
          </article>
          <p v-if="!watches.length" class="empty-section">
            在字段、排名或查询结果中点击“关注”，也可以输入精确路径。
          </p>
          <details v-if="otherWatches.length">
            <summary>页面范围不匹配 · {{ otherWatches.length }} 项</summary><div v-for="rule in otherWatches" :key="rule.id" class="favorite-row">
              <span>{{ rule.name }} · {{ rule.scope.pathname }} · {{ rule.scope.app }}</span><button class="btn btn-xs btn-ghost" @click="removeRule(rule.id)">
                删除
              </button>
            </div>
          </details>
        </template>
      </div>
      <aside v-if="detail" class="field-detail" aria-label="字段详情">
        <div class="feature-heading">
          <h3>字段详情</h3><button class="btn btn-xs btn-ghost" @click="detail = null">
            关闭
          </button>
        </div><p class="mono break-text">
          {{ formatPath(detail.path) }}
        </p><p class="feature-caption">
          {{ detail.sourceIds.length > 1 ? '同名顶层字段曾被覆盖，最后一份为当前来源：' : '字段来源：' }}{{ detail.sourceIds.map(sourceLabel).join(' → ') }}
        </p><WatchButton :path="detail.path" :watched="watchedPaths.has(formatPath(detail.path))" :busy="pendingWatchPaths.has(formatPath(detail.path))" label="关注此字段" @toggle="toggleWatch" /><DataTreeNode v-if="detail.tree" :key="formatPath(detail.path)" :node="detail.tree.root" :watched-paths="watchedPaths" :pending-watch-paths="pendingWatchPaths" initial-open @notice="emit('notice', $event)" @watch="toggleWatch" @locate="locate" /><p v-else class="feature-caption">
          {{ detail.known ? '字段不存在。' : '索引未覆盖此路径，无法确认。' }}
        </p><p v-if="detail.tree?.truncated" class="feature-caption">
          局部视图达到 10,000 节点／60 层限制。
        </p>
      </aside>
    </div>
  </section>
</template>
