<script setup lang="ts">
import type { SeoSnapshot } from './model'
import { computed, ref, watch } from 'vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiNotice from '@/components/ui/UiNotice.vue'
import UiSearchInput from '@/components/ui/UiSearchInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiTabList from '@/components/ui/UiTabList.vue'
import UiTabPanel from '@/components/ui/UiTabPanel.vue'
import UiTabs from '@/components/ui/UiTabs.vue'
import SeoFieldRow from './components/SeoFieldRow.vue'
import SeoMetrics from './components/SeoMetrics.vue'
import SeoOverview from './components/SeoOverview.vue'
import SeoResources from './components/SeoResources.vue'
import SeoSocial from './components/SeoSocial.vue'
import SeoSourceInfo from './components/SeoSourceInfo.vue'
import SeoTools from './components/SeoTools.vue'
import SeoUrl from './components/SeoUrl.vue'
import { GROUPS } from './model'
import { headingText, sectionFields, SEO_SECTIONS, seoFieldGroups } from './presentation'
import { useSeoRequests } from './useSeoRequests'
import { SEO_SOURCES, useSeoViewState } from './useSeoViewState'

const props = defineProps<{
  active: boolean
  dom: SeoSnapshot | null
  html: SeoSnapshot | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string
  sourceNotice: string
  canReadHtml: boolean
}>()
const emit = defineEmits<{ refresh: [kind: 'dom' | 'html'], cancel: [], copy: [text: string], download: [text: string, filename: string, type: string] }>()
const { filters, display, section, expanded, limit, snapshot, filtered, setExpanded } = useSeoViewState({ dom: () => props.dom, html: () => props.html })
const structured = ref('all')
const { headers: headerRequest, references, readHeaders, checkHreflang, cancel: cancelRequests } = useSeoRequests(() => snapshot.value, () => props.active)
const requesting = computed(() => headerRequest.value.loading || Object.values(references.value).some(reference => reference.loading))
const fields = computed(() => sectionFields(filtered.value, section.value, structured.value))
const currentSection = computed(() => SEO_SECTIONS.find(item => item.id === section.value)!)
const headingCounts = computed(() => Array.from({ length: 6 }, (_, index) => ({ label: `H${index + 1}`, value: snapshot.value?.fields.filter(field => field.key === `heading:h${index + 1}`).length ?? 0 })))
const fieldGroups = computed(() => seoFieldGroups(fields.value.slice(0, limit.value), section.value))
watch(structured, () => {
  expanded.value = null
  limit.value = 50
})
const headings = computed(() => headingText(snapshot.value?.fields ?? []))
function exportSchema() {
  const records = fields.value.map(field => ({ label: field.label, value: field.value, truncated: field.truncated, jsonError: field.jsonError }))
  emit('download', JSON.stringify(records, null, 2), 'seo-structured.json', 'application/json;charset=utf-8')
}
</script>

<template>
  <section v-show="active" class="feature-card glass-card seo-card" aria-label="SEO 工作区" :aria-busy="status === 'loading'">
    <div class="seo-workspace-heading">
      <h2>SEO 数据</h2>
      <UiSelect v-model="display" class="seo-source-select" label="SEO 数据来源" :items="SEO_SOURCES" :disabled="!active" />
    </div>
    <div class="seo-source-toolbar">
      <div class="seo-actions">
        <UiActionButton v-if="display === 'dom'" :disabled="status === 'loading'" size="sm" @click="emit('refresh', 'dom')">
          重新读取 DOM
        </UiActionButton>
        <UiActionButton v-else-if="canReadHtml" :disabled="status === 'loading'" size="sm" @click="emit('refresh', 'html')">
          读取 HTML
        </UiActionButton>
        <UiActionButton v-if="status === 'loading'" size="sm" @click="emit('cancel')">
          取消读取
        </UiActionButton>
      </div>
      <span v-if="snapshot" class="seo-sample-time">{{ new Date(snapshot.sampledAt).toLocaleTimeString() }} 采样</span>
    </div>
    <div class="seo-tab-panel">
      <UiNotice v-if="error" role="alert" severity="warning">
        {{ error }}<span v-if="snapshot"> 当前保留上次成功读取的数据，请注意采样时间。</span>
      </UiNotice>
      <UiEmptyState v-if="status === 'loading'" size="inline" kind="loading">
        正在读取 SEO 数据…
      </UiEmptyState>
      <template v-if="snapshot">
        <UiNotice v-if="!snapshot.complete" severity="warning">
          采集仅部分完成，列表和统计只包含已读取内容。
        </UiNotice>
        <UiTabs v-model="section" :items="SEO_SECTIONS">
          <div class="seo-content">
            <UiTabList class="seo-sections" label="SEO 内容分类" />
            <UiTabPanel :value="section">
              <div class="seo-section-content">
                <header class="seo-section-header">
                  <div>
                    <h3>{{ currentSection.label }}</h3>
                    <p>{{ currentSection.description }}</p>
                  </div>
                  <div v-if="section === 'headings'" class="seo-actions">
                    <UiActionButton :disabled="!headings" size="sm" @click="emit('copy', headings)">
                      复制全部标题
                    </UiActionButton>
                    <UiActionButton :disabled="!headings" size="sm" @click="emit('download', headings, 'seo-headings.txt', 'text/plain;charset=utf-8')">
                      导出标题 TXT
                    </UiActionButton>
                  </div>
                  <div v-if="section === 'structured'" class="seo-actions">
                    <UiActionButton :disabled="!fields.length" size="sm" @click="exportSchema">
                      导出当前结构化数据 JSON
                    </UiActionButton>
                  </div>
                </header>
                <template v-if="section === 'overview'">
                  <SeoOverview :snapshot="snapshot" :header-sample="headerRequest.value" @copy="emit('copy', $event)">
                    <template #header-actions>
                      <UiActionButton v-if="!snapshot.headers" :disabled="headerRequest.loading" size="sm" @click="readHeaders">
                        {{ headerRequest.loading ? '正在读取响应头…' : '读取响应头（HEAD）' }}
                      </UiActionButton>
                    </template>
                    <template #header-notice>
                      <UiNotice v-if="headerRequest.error" severity="warning">
                        {{ headerRequest.error }}
                      </UiNotice>
                    </template>
                  </SeoOverview>
                </template>
                <SeoMetrics v-if="section === 'headings'" :items="headingCounts" label="标题级别统计" />
                <SeoSocial v-if="section === 'social'" :snapshot="snapshot" />
                <div v-if="requesting" class="seo-actions">
                  <UiActionButton size="sm" @click="cancelRequests">
                    取消额外请求
                  </UiActionButton>
                </div>
                <SeoTools v-if="section === 'tools'" :url="snapshot.url" />
                <h4 v-if="section === 'overview' || section === 'social'" class="seo-details-heading">
                  {{ section === 'overview' ? '完整字段' : '原始分享标签' }}
                </h4>
                <div v-if="!['tools', 'links', 'images'].includes(section)" class="seo-filters">
                  <UiSearchInput v-model="filters.search" label="筛选 SEO 字段名称或值" placeholder="筛选字段、文字或地址" />
                  <UiSelect v-if="section === 'overview'" v-model="filters.group" label="SEO 字段分组" :items="[{ value: 'all', label: '全部分组' }, ...Object.entries(GROUPS).filter(([value]) => !['structured', 'headings', 'social'].includes(value)).map(([value, label]) => ({ value, label }))]" />
                  <UiSelect v-if="section === 'structured'" v-model="structured" label="结构化数据类型" :items="[{ value: 'all', label: '全部类型' }, { value: 'jsonld', label: 'JSON-LD' }, { value: 'microdata', label: 'Microdata' }, { value: 'hreflang', label: 'hreflang' }]" />
                </div>
                <SeoResources v-if="section === 'links' || section === 'images'" :snapshot="snapshot" :kind="section" :search="filters.search" @copy="emit('copy', $event)" @download="(text, filename, type) => emit('download', text, filename, type)">
                  <template #search>
                    <UiSearchInput v-model="filters.search" label="筛选 SEO 字段名称或值" placeholder="筛选文字或地址" />
                  </template>
                </SeoResources>
                <template v-else-if="section !== 'tools'">
                  <p class="feature-caption" role="status">
                    {{ fields.length }} 个匹配字段
                  </p>
                  <section v-for="group in fieldGroups" :key="group.key" class="seo-field-group" :aria-label="group.label">
                    <header class="seo-field-group-heading">
                      <h4>{{ group.label }}</h4>
                    </header>
                    <div v-for="field in group.fields" :key="field.id" class="seo-field-record" :class="{ 'seo-heading-record': section === 'headings' }" :style="section === 'headings' ? { '--seo-heading-depth': Number(field.label.slice(1)) - 1 } : undefined">
                      <SeoFieldRow :field="field" :source="display === 'dom' ? 'DOM' : 'HTML'" :open="expanded === field.id" @update:open="setExpanded(field.id, $event)" @copy="emit('copy', $event)" />
                      <div v-if="field.group === 'languages'" class="seo-language-actions">
                        <SeoUrl :value="field.value" :base="snapshot.page?.baseUrl || snapshot.url" />
                        <UiActionButton :disabled="field.truncated || references[field.id]?.loading" size="sm" @click="checkHreflang(field.id)">
                          {{ references[field.id]?.loading ? '正在检查…' : '检查状态与回链' }}
                        </UiActionButton>
                        <p v-if="references[field.id]?.value" class="feature-caption">
                          HTTP {{ references[field.id]!.value!.status }} · {{ references[field.id]!.value!.url }} · 回链：{{ references[field.id]!.value!.backReference === null ? '无法确认' : references[field.id]!.value!.backReference ? '有' : '无' }}
                        </p>
                        <UiNotice v-if="references[field.id]?.error" severity="warning">
                          {{ references[field.id]!.error }}
                        </UiNotice>
                      </div>
                    </div>
                  </section>
                  <UiEmptyState v-if="!fields.length">
                    当前筛选下没有匹配字段。
                  </UiEmptyState>
                  <UiActionButton v-if="fields.length > limit" size="sm" @click="limit += 50">
                    再显示 50 项
                  </UiActionButton>
                </template>
              </div>
            </UiTabPanel>
          </div>
        </UiTabs>
      </template>
      <UiEmptyState v-else-if="status !== 'loading' && display === 'html'">
        {{ canReadHtml ? '点击读取 HTML，查看浏览器保存的本次文档响应。必要时先刷新被检查页面。' : 'HTML 正文仅在 DevTools 中读取；侧边栏可查看当前 DOM。' }}
      </UiEmptyState>
      <UiEmptyState v-else-if="status !== 'loading' && !error">
        打开 HTTP(S) 页面后读取 SEO 数据。
      </UiEmptyState>
      <SeoSourceInfo :dom="dom" :html="html" :source-notice="sourceNotice" />
    </div>
  </section>
</template>
