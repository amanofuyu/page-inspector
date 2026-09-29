import type { SeoRow, SeoSnapshot } from './model'
import { refDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { compareSeo, inspectSeo } from './compare'

export const SEO_VIEWS = [
  { id: 'compare', label: '差异' },
  { id: 'html', label: 'HTML' },
  { id: 'dom', label: 'DOM' },
  { id: 'issues', label: '问题' },
] as const
export type SeoDisplay = typeof SEO_VIEWS[number]['id']

/** 仅用于展示的筛选条件，不写入采集快照或报告。 */
export interface SeoFilters {
  search: string
  group: string
  change: string
  condition: string
  severity: string
}

export function filterSeoRows(rows: readonly SeoRow[], dom: SeoSnapshot | null, filters: SeoFilters) {
  const counts = new Map<string, number>()
  for (const field of dom?.fields ?? [])
    counts.set(field.key, (counts.get(field.key) ?? 0) + 1)
  const text = filters.search.trim().toLocaleLowerCase()
  return rows.filter(row =>
    (filters.group === 'all' || row.group === filters.group)
    && (filters.condition === 'all'
      || (filters.condition === 'empty' && !!row.dom && !row.dom.value.trim())
      || (filters.condition === 'missing' && !row.dom && dom?.complete && row.group !== 'transport')
      || (filters.condition === 'multiple' && (counts.get(row.key) ?? 0) > 1))
    && (filters.change === 'all'
      || (filters.change === 'differences'
        ? ['added', 'changed', 'removed'].includes(row.change)
        || (row.change === 'reference' && row.html?.normalized !== row.dom?.normalized)
        : row.change === filters.change))
      && (!text || `${row.label}\n${row.dom?.value ?? ''}\n${row.html?.value ?? ''}`.toLocaleLowerCase().includes(text)),
  )
}

/** 业务快照只读输入；筛选、页签、展开和分页均是该视图会话的组件状态。 */
export function useSeoViewState(source: { dom: () => SeoSnapshot | null, html: () => SeoSnapshot | null }) {
  const filters = ref<SeoFilters>({ search: '', group: 'all', change: 'all', condition: 'all', severity: 'all' })
  const display = ref<SeoDisplay>('compare')
  const expanded = ref<string | null>(null)
  const limit = ref(50)
  const search = refDebounced(computed(() => filters.value.search), 150)
  const rows = computed(() => {
    const dom = source.dom()
    return dom ? compareSeo(dom, source.html()) : []
  })
  const issues = computed(() => {
    const dom = source.dom()
    return dom ? inspectSeo(dom, source.html(), rows.value) : []
  })
  const filtered = computed(() => filterSeoRows(rows.value, source.dom(), { ...filters.value, search: search.value }))
  const visibleIssues = computed(() => issues.value.filter(issue => filters.value.severity === 'all' || issue.level === filters.value.severity))
  const changeCount = computed(() => rows.value.filter(row => ['added', 'changed', 'removed'].includes(row.change)).length)
  const context = computed(() => {
    const dom = source.dom()
    return `${dom?.identity.tabId}:${dom?.identity.documentId}:${dom?.url}`
  })
  function resetDetails() {
    expanded.value = null
    limit.value = 50
  }
  watch([filters, display, context], resetDetails, { flush: 'sync' })
  watch(filtered, (rows) => {
    if (expanded.value && !rows.some(row => row.id === expanded.value))
      expanded.value = null
  }, { flush: 'sync' })
  function setExpanded(id: string, open: boolean) {
    if (open && filtered.value.some(row => row.id === id))
      expanded.value = id
    else if (expanded.value === id)
      expanded.value = null
  }
  function locateIssue(key: string) {
    display.value = 'compare'
    filters.value = { ...filters.value, group: 'all', change: 'all', condition: 'all', search: key.replace(/^(meta|link|http):/, '') }
  }
  return { filters, display, expanded, limit, rows, issues, filtered, visibleIssues, changeCount, setExpanded, locateIssue }
}
