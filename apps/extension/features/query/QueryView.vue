<script setup lang="ts">
import type { FieldPath } from '../inspection/model'
import type { SavedQuery } from '../watch/model'
import type { QueryResult, QuerySpec } from './engine'
import { ChevronRight } from '@lucide/vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import WatchButton from '../inspector/WatchButton.vue'
import QueryConditionEditor from './components/QueryConditionEditor.vue'
import { formatPath } from './path'

defineProps<{
  spec: QuerySpec
  queryName: string
  ready: boolean
  pending: number
  canSave: boolean
  queryError: string
  favorites: SavedQuery[]
  results: QueryResult | null
  sourceLabels: Record<string, string>
  detailLocation: string | null
  watchedPaths: ReadonlySet<string>
  pendingWatchPaths: ReadonlySet<string>
}>()
const emit = defineEmits<{
  'update:spec': [spec: QuerySpec]
  'update:queryName': [name: string]
  'query': []
  'page': [offset: number]
  'save': []
  'remove': [id: string]
  'export': []
  'copy': [value: unknown]
  'detail': [location: string, path: FieldPath]
  'watch': [path: FieldPath]
}>()
</script>

<template>
  <div class="feature-heading">
    <h2>高级检索</h2><span class="feature-caption">独立索引 · 每页 50 条</span>
  </div>
  <QueryConditionEditor :model-value="spec" @update:model-value="emit('update:spec', $event)" />
  <p class="feature-caption">
    相对路径从所选分类开始；$ 表示应用根。支持 *、[*] 和 ["带点.的属性"]。数字值需要明确选择 number。
  </p>
  <div class="feature-toolbar">
    <UiActionButton :disabled="spec.conditions.length >= 10" size="sm" @click="emit('update:spec', { ...spec, conditions: [...spec.conditions, { field: 'value', op: 'eq', valueType: 'number', value: '' }] })">
      添加条件
    </UiActionButton><UiActionButton :disabled="!ready || !!pending" size="sm" variant="primary" @click="emit('query')">
      执行查询
    </UiActionButton>
  </div>
  <p v-if="queryError" class="query-error" role="alert">
    查询失败：{{ queryError }}
  </p>
  <div class="favorite-editor">
    <input :value="queryName" class="input input-sm" aria-label="查询名称" placeholder="查询名称" @input="emit('update:queryName', ($event.target as HTMLInputElement).value)"><UiActionButton :disabled="!canSave" size="sm" @click="emit('save')">
      收藏条件
    </UiActionButton>
  </div>
  <div v-for="favorite in favorites" :key="favorite.id" class="favorite-row">
    <UiActionButton @click="emit('update:spec', JSON.parse(JSON.stringify(favorite.query)))">
      {{ favorite.name }}
    </UiActionButton><UiActionButton @click="emit('remove', favorite.id)">
      删除
    </UiActionButton>
  </div>
  <template v-if="results">
    <div class="feature-toolbar">
      <p class="feature-caption query-result-status" role="status">
        {{ results.total }} 条匹配 · {{ results.limited ? '达到 1,000 条展示上限' : results.coverage.status === 'complete' ? '扫描完整' : '仅代表已扫描范围，未匹配不等于不存在' }}
      </p><UiActionButton @click="emit('export')">
        导出本页摘要
      </UiActionButton>
    </div>
    <article v-for="(match, index) in results.matches" :key="match.path" class="query-result">
      <button class="path-button query-path-button mono" :aria-expanded="detailLocation === `query-${index}`" :aria-controls="detailLocation === `query-${index}` ? `query-detail-${index}` : undefined" @click="emit('detail', `query-${index}`, match.fieldPath)">
        <ChevronRight class="disclosure-chevron" :size="14" aria-hidden="true" /><span>{{ match.path }}</span>
      </button><p>{{ match.type }} · {{ match.preview }}</p><p class="feature-caption">
        {{ sourceLabels[match.sourceId ?? ''] || '来源未确认' }} · {{ match.reasons.join('；') }}
      </p><div class="feature-toolbar">
        <UiActionButton @click="emit('copy', match)">
          复制摘要
        </UiActionButton><WatchButton :path="match.fieldPath" :watched="watchedPaths.has(formatPath(match.fieldPath))" :busy="pendingWatchPaths.has(formatPath(match.fieldPath))" @toggle="emit('watch', $event)" />
      </div>
      <slot :id="`query-detail-${index}`" name="detail" :location="`query-${index}`" />
    </article>
    <div class="feature-toolbar">
      <UiActionButton :disabled="results.offset === 0 || !!pending" size="sm" @click="emit('page', results.offset - 50)">
        上一页
      </UiActionButton><span>{{ results.offset / 50 + 1 }} / {{ Math.max(1, Math.ceil(results.total / 50)) }}</span><UiActionButton :disabled="results.offset + 50 >= results.total || !!pending" size="sm" @click="emit('page', results.offset + 50)">
        下一页
      </UiActionButton>
    </div>
  </template>
</template>
