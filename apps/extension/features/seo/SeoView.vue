<script setup lang="ts">
import type { NetworkSession } from '../network/session'
import type { SeoField, SeoRow } from './model'
import type { ToastInput } from '@/composables/useToast'
import { ChevronRight, Copy, Download, RefreshCw, Search } from '@lucide/vue'
import { refDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useSeoInspection } from '@/composables/useSeoInspection'
import ExpandTransition from '../inspector/ExpandTransition.vue'
import { compareSeo, inspectSeo, seoMarkdown, seoReport } from './compare'
import { CHANGES, GROUPS } from './model'
import { seoFieldPreview } from './preview'

const props = defineProps<{
  active: boolean
  tabId: number | null
  network?: NetworkSession
}>()
const emit = defineEmits<{ notice: [notice: ToastInput] }>()
const {
  dom,
  html,
  status,
  error,
  sourceNotice,
  refresh,
  reloadAndCapture,
  cancel,
} = useSeoInspection({
  tabId: () => props.tabId,
  active: () => props.active,
  network: () => props.network,
})
const search = ref('')
const debouncedSearch = refDebounced(search, 150)
const group = ref('all')
const change = ref('all')
const condition = ref('all')
const severity = ref('all')
const display = ref<'compare' | 'html' | 'dom' | 'issues'>('compare')
const expanded = ref<string | null>(null)
const limit = ref(50)
const previewCache = new WeakMap<SeoField, ReturnType<typeof seoFieldPreview>>()
function preview(field: SeoField) {
  let result = previewCache.get(field)
  if (!result) {
    result = seoFieldPreview(field)
    previewCache.set(field, result)
  }
  return result
}
function summary(field?: SeoField) {
  if (!field)
    return ''
  if (field.group !== 'structured')
    return field.value.slice(0, 240)
  const result = preview(field)
  const text = result.text.split('\n').slice(0, 8).join('\n').slice(0, 240)
  return text + (text.length < result.text.length || result.truncated ? '…' : '')
}
const rows = computed(() =>
  dom.value ? compareSeo(dom.value, html.value) : [],
)
const issues = computed(() =>
  dom.value ? inspectSeo(dom.value, html.value, rows.value) : [],
)
const visibleIssues = computed(() =>
  issues.value.filter(
    issue => severity.value === 'all' || issue.level === severity.value,
  ),
)
const counts = computed(() => {
  const result = new Map<string, number>()
  for (const field of dom.value?.fields ?? [])
    result.set(field.key, (result.get(field.key) ?? 0) + 1)
  return result
})
const filtered = computed(() =>
  rows.value.filter((row) => {
    const text = debouncedSearch.value.trim().toLocaleLowerCase()
    return (
      (group.value === 'all' || row.group === group.value)
      && (condition.value === 'all'
        || (condition.value === 'empty' && !!row.dom && !row.dom.value.trim())
        || (condition.value === 'missing'
          && !row.dom
          && dom.value?.complete
          && row.group !== 'transport')
        || (condition.value === 'multiple'
          && (counts.value.get(row.key) ?? 0) > 1))
        && (change.value === 'all'
          || (change.value === 'differences'
            ? ['added', 'changed', 'removed'].includes(row.change)
            || (row.change === 'reference'
              && row.html?.normalized !== row.dom?.normalized)
            : row.change === change.value))
          && (!text
            || `${row.label}\n${row.dom?.value ?? ''}\n${row.html?.value ?? ''}`
              .toLocaleLowerCase()
              .includes(text))
    )
  }),
)
const sourceLabel = computed(() =>
  !html.value
    ? '尚未捕获本次文档 HTML'
    : html.value.source === 'refetch-reference'
      ? '参考 HTML · 重新请求'
      : '初始 HTML · 已关联本次文档响应',
)
const changeCount = computed(
  () =>
    rows.value.filter(row =>
      ['added', 'changed', 'removed'].includes(row.change),
    ).length,
)
watch([search, group, change, condition, display], () => {
  limit.value = 50
  expanded.value = null
})
watch(
  () => `${dom.value?.identity.documentId}:${dom.value?.url}`,
  () => {
    expanded.value = null
    limit.value = 50
  },
)
function toggle(row: SeoRow) {
  expanded.value = expanded.value === row.id ? null : row.id
}
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    emit('notice', { message: '已复制 SEO 数据', kind: 'success' })
  }
  catch {
    emit('notice', { message: '复制失败，请重试。', kind: 'error' })
  }
}
function download(format: 'json' | 'md') {
  if (!dom.value)
    return
  try {
    const content
      = format === 'json'
        ? JSON.stringify(seoReport(dom.value, html.value), null, 2)
        : seoMarkdown(dom.value, html.value)
    const url = URL.createObjectURL(
      new Blob([content], {
        type:
          format === 'json'
            ? 'application/json;charset=utf-8'
            : 'text/markdown;charset=utf-8',
      }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `page-seo-${Date.now()}.${format}`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    emit('notice', { message: '已导出 SEO 报告，包含来源、覆盖范围和完整字段', kind: 'success' })
  }
  catch {
    emit('notice', { message: 'SEO 报告导出失败，请重试。', kind: 'error' })
  }
}
function locateIssue(key: string) {
  display.value = 'compare'
  group.value = 'all'
  change.value = 'all'
  condition.value = 'all'
  search.value = key.replace(/^(meta|link|http):/, '')
}
defineExpose({ dom, status, refresh })
</script>

<template>
  <section
    v-show="active"
    class="feature-card glass-card seo-card"
    aria-label="SEO 工作区"
    :aria-busy="status === 'loading'"
  >
    <div class="feature-heading">
      <h2>页面 SEO</h2>
      <span class="feature-caption">主文档 · 独立于 Nuxt payload</span>
    </div>
    <div class="seo-actions">
      <button
        class="btn btn-sm btn-ghost"
        :disabled="status === 'loading'"
        @click="refresh()"
      >
        <RefreshCw :size="14" aria-hidden="true" />重新读取 SEO
      </button>
      <button
        class="btn btn-sm btn-ghost"
        :disabled="status === 'loading'"
        @click="refresh('reference')"
      >
        读取参考 HTML
      </button>
      <button
        v-if="network"
        class="btn btn-sm btn-ghost"
        :disabled="status === 'loading'"
        @click="refresh('navigation')"
      >
        读取已捕获 HTML
      </button>
      <button
        v-if="network"
        class="btn btn-sm btn-ghost"
        :disabled="status === 'loading'"
        @click="reloadAndCapture"
      >
        刷新并捕获 HTML
      </button>
      <button
        v-if="status === 'loading'"
        class="btn btn-sm btn-ghost"
        @click="cancel"
      >
        取消读取
      </button>
    </div>
    <p v-if="error" class="notice notice-warning" role="alert">
      {{ error
      }}<span v-if="dom"> 当前保留上次成功取得的数据，请注意采样时间。</span>
    </p>
    <p v-if="status === 'loading'" class="feature-caption" role="status">
      正在读取 SEO 数据…
    </p>
    <template v-if="dom">
      <details class="disclosure-section seo-source">
        <summary class="disclosure-summary">
          <ChevronRight
            class="disclosure-chevron"
            :size="14"
            aria-hidden="true"
          /><span>{{ sourceLabel }}</span>
        </summary>
        <p class="break-text">
          当前 DOM：{{ dom.url }} ·
          {{ new Date(dom.sampledAt).toLocaleTimeString() }}
        </p>
        <p v-if="html" class="break-text">
          HTML：{{ html.url }} ·
          {{ new Date(html.sampledAt).toLocaleTimeString() }} · HTTP
          {{ html.status }}
        </p>
        <p>
          初始 HTML 可能来自 SSR、预渲染或缓存；当前 DOM
          同时包含初始标签与客户端变化。
        </p>
        <p v-if="!html">
          可在 DevTools 中刷新并捕获实际文档，或重新请求 HTML
          作参考。参考差异不能证明 CSR 来源。
        </p>
        <p v-if="sourceNotice">
          {{ sourceNotice }}
        </p>
        <p
          v-for="reason in [...dom.reasons, ...(html?.reasons ?? [])]"
          :key="reason"
        >
          {{ reason }}
        </p>
      </details>
      <p
        v-if="!dom.complete || (html && !html.complete)"
        class="notice notice-warning"
        role="status"
      >
        采集仅部分完成，未发现的字段不代表不存在。
      </p>
      <p class="seo-summary" role="status">
        {{ dom.fields.length }} 个 DOM 字段 · {{ changeCount }} 个已确认变化 ·
        {{ issues.length }} 条问题与提示
      </p>
      <nav class="view-tabs seo-tabs" aria-label="SEO 查看方式">
        <button
          v-for="item in [
            { id: 'compare', label: '差异' },
            { id: 'html', label: 'HTML' },
            { id: 'dom', label: 'DOM' },
            { id: 'issues', label: '问题' },
          ]"
          :key="item.id"
          :aria-pressed="display === item.id"
          :class="{ active: display === item.id }"
          @click="display = item.id as typeof display"
        >
          {{ item.label }}
        </button>
      </nav>
      <div v-if="display !== 'issues'" class="seo-filters">
        <label class="search-input"><Search :size="15" aria-hidden="true" /><input
          v-model="search"
          type="search"
          aria-label="搜索 SEO 字段"
          placeholder="搜索标签名称或值"
        ></label>
        <select v-model="group" class="select select-sm" aria-label="SEO 分组">
          <option value="all">
            全部分组
          </option>
          <option v-for="(label, key) in GROUPS" :key="key" :value="key">
            {{ label }}
          </option>
        </select>
        <select
          v-model="change"
          class="select select-sm"
          aria-label="SEO 来源状态"
        >
          <option value="all">
            全部来源状态
          </option>
          <option value="differences">
            仅看差异
          </option>
          <option v-for="(label, key) in CHANGES" :key="key" :value="key">
            {{ label }}
          </option>
        </select>
      </div>
      <select
        v-if="display !== 'issues'"
        v-model="condition"
        class="select select-sm w-full"
        aria-label="SEO 字段情况"
      >
        <option value="all">
          全部字段情况
        </option>
        <option value="empty">
          DOM 空值
        </option>
        <option value="missing">
          DOM 未发现
        </option>
        <option value="multiple">
          DOM 多值／重复
        </option>
      </select>
      <select
        v-else
        v-model="severity"
        class="select select-sm w-full"
        aria-label="SEO 问题等级"
      >
        <option value="all">
          全部问题与提示
        </option>
        <option value="problem">
          问题
        </option>
        <option value="review">
          需要核对
        </option>
        <option value="info">
          信息
        </option>
      </select>
      <div class="seo-actions seo-export">
        <button class="btn btn-xs btn-ghost" @click="download('json')">
          <Download :size="13" aria-hidden="true" />导出 JSON
        </button>
        <button class="btn btn-xs btn-ghost" @click="download('md')">
          导出 Markdown
        </button>
      </div>
      <template v-if="display === 'issues'">
        <p v-if="!visibleIssues.length" class="empty-section">
          当前筛选范围内没有问题；不代表保证收录或通过全部富结果验证。
        </p>
        <article
          v-for="issue in visibleIssues"
          :key="issue.id"
          class="seo-issue"
          :data-level="issue.level"
        >
          <strong>{{
            { problem: '问题', review: '需要核对', info: '信息' }[issue.level]
          }}
            · {{ issue.title }}</strong>
          <p>{{ issue.detail }}</p>
          <button
            v-if="issue.key"
            class="btn btn-xs btn-ghost"
            @click="locateIssue(issue.key)"
          >
            查看相关字段
          </button>
        </article>
      </template>
      <template v-else>
        <p class="feature-caption" role="status">
          {{ filtered.length }} 条匹配{{
            !dom.complete ? ' · 仅覆盖已采集字段' : ''
          }}
        </p>
        <p v-if="display === 'html' && !html" class="empty-section">
          尚未取得 HTML 基线。当前 DOM 字段仍可查看。
        </p>
        <article
          v-for="row in filtered.slice(0, limit)"
          :key="row.id"
          class="seo-row"
          :data-key="row.key"
          :data-change="row.change"
        >
          <button
            class="seo-row-toggle"
            :aria-expanded="expanded === row.id"
            @click="toggle(row)"
          >
            <ChevronRight
              class="disclosure-chevron"
              :size="14"
              aria-hidden="true"
            /><strong>{{ row.label }}</strong><span class="seo-badge">{{ CHANGES[row.change] }}</span>
          </button>
          <div
            class="seo-values"
            :class="{ 'seo-single': display !== 'compare' }"
          >
            <div v-if="display !== 'dom'">
              <small>HTML</small>
              <p :class="{ 'seo-json-preview': row.group === 'structured' }">
                {{
                  summary(row.html)
                    || (row.html ? '（空值）' : html?.complete ? '未发现' : '未确认')
                }}
              </p>
            </div>
            <div v-if="display !== 'html'">
              <small>DOM</small>
              <p :class="{ 'seo-json-preview': row.group === 'structured' }">
                {{
                  row.group === 'transport'
                    ? '仅来自 HTTP 响应'
                    : summary(row.dom)
                      || (row.dom
                        ? '（空值）'
                        : dom.complete
                          ? '未发现'
                          : '未确认')
                }}
              </p>
            </div>
          </div>
          <ExpandTransition>
            <div v-if="expanded === row.id" class="seo-field-detail">
              <p v-if="row.group === 'headings'">
                仅展示 H1，按其在文档中的顺序比较，不追踪 DOM 节点身份。
              </p>
              <p>
                {{ GROUPS[row.group] }} · {{ CHANGES[row.change]
                }}<span v-if="row.change === 'reference'">
                  · 本次重新请求与 DOM 的参考对比</span>
              </p>
              <template
                v-for="(field, key) in { HTML: row.html, DOM: row.dom }"
                :key="key"
              >
                <div v-if="field">
                  <div class="feature-heading">
                    <strong>{{ key }} · {{ field.location }} ·
                      {{ field.value.length.toLocaleString() }} 字符</strong><button
                      class="btn btn-xs btn-ghost"
                      :aria-label="`复制 ${key} ${row.label}`"
                      @click="copy(field.snippet)"
                    >
                      <Copy :size="13" aria-hidden="true" />复制标签
                    </button>
                  </div>
                  <p v-if="field.truncated" class="notice notice-warning">
                    该字段达到读取或结构比较上限，无法确认完整差异。
                  </p>
                  <p v-if="field.jsonError" class="notice notice-error">
                    {{ field.jsonError }}
                  </p>
                  <pre>{{ preview(field).text }}</pre>
                  <p
                    v-if="preview(field).truncated"
                    class="feature-caption"
                  >
                    仅预览前 16,000 字符；复制和导出包含完整已采集内容。
                  </p>
                </div>
              </template>
              <button
                class="btn btn-xs btn-ghost"
                @click="copy(JSON.stringify(row, null, 2))"
              >
                复制字段对比
              </button>
            </div>
          </ExpandTransition>
        </article>
        <p v-if="!filtered.length" class="empty-section">
          当前筛选下没有匹配字段。
        </p>
        <button
          v-if="filtered.length > limit"
          class="btn btn-sm btn-ghost"
          @click="limit += 50"
        >
          再显示 50 项
        </button>
      </template>
    </template>
    <p v-else-if="status !== 'loading' && !error" class="empty-section">
      打开 HTTP(S) 页面后读取 SEO 数据。
    </p>
  </section>
</template>
