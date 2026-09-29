<script setup lang="ts">
import type { FieldPath } from '../inspection/model'
import type { IndexReady, WorkerOperations } from '@/workers/protocol'
import { ChevronRight, Download, RefreshCw } from '@lucide/vue'
import { computed } from 'vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import UiDisclosure from '@/components/ui/UiDisclosure.vue'
import UiNotice from '@/components/ui/UiNotice.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import { formatBytes as size } from '../inspector/format'
import WatchButton from '../inspector/WatchButton.vue'
import { formatPath } from '../query/path'

type RankingSort = 'size' | 'path' | 'items'
const props = defineProps<{
  ready: IndexReady | null
  pending: number
  analysis: WorkerOperations['analyze']['output'] | null
  rankingSort: RankingSort
  detailLocation: string | null
  watchedPaths: ReadonlySet<string>
  pendingWatchPaths: ReadonlySet<string>
}>()
const emit = defineEmits<{
  'analyze': []
  'export': []
  'update:rankingSort': [value: RankingSort]
  'detail': [location: string, path: FieldPath]
  'watch': [path: FieldPath]
}>()
const rows = computed(() => [...props.analysis?.rows ?? []].sort((a, b) => props.rankingSort === 'path' ? a.path.localeCompare(b.path) : props.rankingSort === 'items' ? (b.itemCount ?? 0) - (a.itemCount ?? 0) : b.estimatedBytes - a.estimatedBytes))
</script>

<template>
  <div class="feature-heading">
    <h2>原文体积与字段估算</h2><UiActionButton :disabled="!ready || !!pending" size="sm" @click="emit('analyze')">
      <RefreshCw :size="14" aria-hidden="true" />{{ analysis ? '重新分析' : '开始分析' }}
    </UiActionButton>
  </div>
  <div class="metric-grid">
    <article v-for="item in ready?.metrics" :key="item.sourceId" class="metric-card">
      <span>{{ item.kind === 'inline' ? '内嵌原文' : '外部原文' }} · {{ item.transport }}</span><strong>{{ size(item.rawUtf8Bytes) }}</strong>
      <span>已采集原文 UTF-8 · {{ item.complete ? '完整取得' : '读取不完整' }} · {{ item.parseStatus }}</span>
      <UiDisclosure class="disclosure-section">
        <template #label>
          <span>来源度量</span>
        </template><p class="break-text">
          {{ item.url }}
        </p><p>消息预算 {{ size(item.messageBytes) }} · 已读下界 {{ size(item.readBytesLowerBound) }}</p><p class="break-text">
          SHA-256 {{ item.digest || '未知' }}
        </p><p v-if="item.error">
          {{ item.error }}
        </p>
      </UiDisclosure>
    </article>
  </div>
  <template v-if="analysis">
    <p class="feature-caption">
      算法 {{ analysis.algorithm }} · {{ analysis.coverage.status === 'complete' ? '完整分析' : '部分分析' }} · {{ analysis.durationMs.toFixed(0) }} ms。字段独立估算，不可相加，也不代表压缩传输字节。
    </p>
    <UiNotice v-if="analysis.coverage.reasons.length" severity="warning">
      {{ analysis.coverage.reasons.join('；') }}
    </UiNotice>
    <div class="feature-toolbar">
      <div class="toolbar-field">
        <span class="toolbar-field-label">字段排名</span><UiSelect :model-value="rankingSort" label="排名排序" :items="[{ value: 'size', label: '估算体积' }, { value: 'items', label: '项数' }, { value: 'path', label: '路径' }] as const" @update:model-value="emit('update:rankingSort', $event)" />
      </div><UiActionButton :disabled="!ready" size="sm" @click="emit('export')">
        <Download :size="14" aria-hidden="true" />导出分析报告
      </UiActionButton>
    </div>
    <ol class="ranking-list">
      <li v-for="row in rows" :key="row.nodeId">
        <button class="ranking-row" :aria-expanded="detailLocation === `ranking-${row.nodeId}`" :aria-controls="detailLocation === `ranking-${row.nodeId}` ? `analysis-detail-ranking-${row.nodeId}` : undefined" @click="emit('detail', `ranking-${row.nodeId}`, row.fieldPath)">
          <span class="analysis-item-label"><ChevronRight class="disclosure-chevron" :size="14" aria-hidden="true" /><span class="mono break-text">{{ row.path }}</span></span><span>{{ row.type }} · {{ row.itemCount ?? '—' }} 项 · {{ row.complete ? '' : '≥ ' }}{{ size(row.estimatedBytes) }}<small v-if="row.references"> · {{ row.references }} 个引用</small></span><span class="ranking-track"><i :style="{ width: `${Math.max(1, row.estimatedBytes / Math.max(1, analysis.rows[0]?.estimatedBytes ?? 1) * 100)}%` }" /></span>
        </button><WatchButton :path="row.fieldPath" :watched="watchedPaths.has(formatPath(row.fieldPath))" :busy="pendingWatchPaths.has(formatPath(row.fieldPath))" @toggle="emit('watch', $event)" />
        <slot :id="`analysis-detail-ranking-${row.nodeId}`" name="detail" :location="`ranking-${row.nodeId}`" />
      </li>
    </ol>
    <UiDisclosure class="distribution disclosure-section">
      <template #label>
        <span>内容分布 · {{ analysis.distribution.sharedEdges }} 条共享引用边</span>
      </template><p class="feature-caption">
        共享引用已节省重复序列化成本，不直接等同于应删除的数据。
      </p><h3>长字符串</h3><div v-for="item in analysis.distribution.strings" :key="item.nodeId" class="distribution-item">
        <button class="distribution-row" :aria-expanded="detailLocation === `strings-${item.nodeId}`" :aria-controls="detailLocation === `strings-${item.nodeId}` ? `analysis-detail-strings-${item.nodeId}` : undefined" @click="emit('detail', `strings-${item.nodeId}`, item.fieldPath)">
          <ChevronRight class="disclosure-chevron" :size="14" aria-hidden="true" /><span>{{ item.path }} · {{ item.length }} 字符</span>
        </button>
        <slot :id="`analysis-detail-strings-${item.nodeId}`" name="detail" :location="`strings-${item.nodeId}`" />
      </div><h3>大集合</h3><div v-for="item in analysis.distribution.collections" :key="item.nodeId" class="distribution-item">
        <button class="distribution-row" :aria-expanded="detailLocation === `collections-${item.nodeId}`" :aria-controls="detailLocation === `collections-${item.nodeId}` ? `analysis-detail-collections-${item.nodeId}` : undefined" @click="emit('detail', `collections-${item.nodeId}`, item.fieldPath)">
          <ChevronRight class="disclosure-chevron" :size="14" aria-hidden="true" /><span>{{ item.path }} · {{ item.itemCount }} 项</span>
        </button>
        <slot :id="`analysis-detail-collections-${item.nodeId}`" name="detail" :location="`collections-${item.nodeId}`" />
      </div><h3>深层结构</h3><div v-for="item in analysis.distribution.deep" :key="item.nodeId" class="distribution-item">
        <button class="distribution-row" :aria-expanded="detailLocation === `deep-${item.nodeId}`" :aria-controls="detailLocation === `deep-${item.nodeId}` ? `analysis-detail-deep-${item.nodeId}` : undefined" @click="emit('detail', `deep-${item.nodeId}`, item.fieldPath)">
          <ChevronRight class="disclosure-chevron" :size="14" aria-hidden="true" /><span>{{ item.path }} · {{ item.fieldPath.length }} 层</span>
        </button>
        <slot :id="`analysis-detail-deep-${item.nodeId}`" name="detail" :location="`deep-${item.nodeId}`" />
      </div>
    </UiDisclosure>
  </template>
</template>
