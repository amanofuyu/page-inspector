import type { SeoField, SeoSnapshot } from './model'
import type { SeoSection } from './presentation'
import { refDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

export const SEO_SOURCES = [{ value: 'dom', label: '当前 DOM' }, { value: 'html', label: '文档 HTML' }] as const
export type SeoDisplay = typeof SEO_SOURCES[number]['value']
export interface SeoFilters { search: string, group: string }

export function filterSeoFields(fields: readonly SeoField[], filters: SeoFilters) {
  const text = filters.search.trim().toLocaleLowerCase()
  return fields.filter(field => (filters.group === 'all' || field.group === filters.group)
    && (!text || `${field.label}\n${field.value}`.toLocaleLowerCase().includes(text)))
}

/** 当前来源直接提供字段列表，不合成缺失项，不计算差异或问题。 */
export function useSeoViewState(source: { dom: () => SeoSnapshot | null, html: () => SeoSnapshot | null }) {
  const filters = ref<SeoFilters>({ search: '', group: 'all' })
  const display = ref<SeoDisplay>('dom')
  const section = ref<SeoSection>('overview')
  const expanded = ref<string | null>(null)
  const limit = ref(50)
  const search = refDebounced(computed(() => filters.value.search), 150)
  const snapshot = computed(() => display.value === 'dom' ? source.dom() : source.html())
  const filtered = computed(() => filterSeoFields(snapshot.value?.fields ?? [], { ...filters.value, search: search.value }))
  const context = computed(() => `${snapshot.value?.identity.tabId}:${snapshot.value?.identity.documentId}:${snapshot.value?.url}`)
  watch([filters, display, section, context], () => {
    expanded.value = null
    limit.value = 50
  }, { flush: 'sync' })
  watch(section, () => {
    filters.value = { ...filters.value, group: 'all' }
  }, { flush: 'sync' })
  watch(filtered, (fields) => {
    if (expanded.value && !fields.some(field => field.id === expanded.value))
      expanded.value = null
  }, { flush: 'sync' })
  function setExpanded(id: string, open: boolean) {
    if (open && filtered.value.some(field => field.id === id))
      expanded.value = id
    else if (!open && expanded.value === id)
      expanded.value = null
  }
  return { filters, display, section, expanded, limit, snapshot, filtered, setExpanded }
}
