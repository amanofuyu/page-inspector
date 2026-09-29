<script setup lang="ts">
import type { SeoSnapshot } from './model'
import { Download } from '@lucide/vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import UiTabList from '@/components/ui/UiTabList.vue'
import UiTabPanel from '@/components/ui/UiTabPanel.vue'
import UiTabs from '@/components/ui/UiTabs.vue'
import SeoFieldRow from './components/SeoFieldRow.vue'
import SeoFilters from './components/SeoFilters.vue'
import SeoIssues from './components/SeoIssues.vue'
import SeoSourceInfo from './components/SeoSourceInfo.vue'
import SeoToolbar from './components/SeoToolbar.vue'
import { SEO_VIEWS, useSeoViewState } from './useSeoViewState'

const props = defineProps<{
  active: boolean
  dom: SeoSnapshot | null
  html: SeoSnapshot | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string
  sourceNotice: string
  canCapture: boolean
}>()
const emit = defineEmits<{
  refresh: [kind: 'dom' | 'reference' | 'navigation']
  reload: []
  cancel: []
  copy: [text: string]
  export: [format: 'json' | 'md']
}>()
const { filters, display, expanded, limit, issues, filtered, visibleIssues, changeCount, setExpanded, locateIssue } = useSeoViewState({ dom: () => props.dom, html: () => props.html })
</script>

<template>
  <UiTabs v-model="display" :items="SEO_VIEWS">
    <section v-show="active" class="feature-card glass-card seo-card" aria-label="SEO 工作区" :aria-busy="status === 'loading'">
      <div class="feature-heading">
        <h2>页面 SEO</h2><span class="feature-caption">主文档 · 独立于 Nuxt payload</span>
      </div>
      <SeoToolbar :busy="status === 'loading'" :can-capture="canCapture" @refresh="emit('refresh', $event)" @reload="emit('reload')" @cancel="emit('cancel')" />
      <p v-if="error" class="notice notice-warning" role="alert">
        {{ error }}<span v-if="dom"> 当前保留上次成功取得的数据，请注意采样时间。</span>
      </p>
      <p v-if="status === 'loading'" class="feature-caption" role="status">
        正在读取 SEO 数据…
      </p>
      <template v-if="dom">
        <SeoSourceInfo :dom="dom" :html="html" :source-notice="sourceNotice" />
        <p v-if="!dom.complete || (html && !html.complete)" class="notice notice-warning" role="status">
          采集仅部分完成，未发现的字段不代表不存在。
        </p>
        <p class="seo-summary" role="status">
          {{ dom.fields.length }} 个 DOM 字段 · {{ changeCount }} 个已确认变化 · {{ issues.length }} 条问题与提示
        </p>
        <UiTabList class="seo-tabs" label="SEO 查看方式" />
        <UiTabPanel :value="display">
          <div class="seo-tab-panel">
            <SeoFilters v-model="filters" :display="display" />
            <div class="seo-actions seo-export">
              <UiActionButton @click="emit('export', 'json')">
                <Download :size="13" aria-hidden="true" />导出 JSON
              </UiActionButton>
              <UiActionButton @click="emit('export', 'md')">
                导出 Markdown
              </UiActionButton>
            </div>
            <SeoIssues v-if="display === 'issues'" :issues="visibleIssues" @locate="locateIssue" />
            <template v-else>
              <p class="feature-caption" role="status">
                {{ filtered.length }} 条匹配{{ !dom.complete ? ' · 仅覆盖已采集字段' : '' }}
              </p>
              <p v-if="display === 'html' && !html" class="empty-section">
                尚未取得 HTML 基线。当前 DOM 字段仍可查看。
              </p>
              <SeoFieldRow
                v-for="row in filtered.slice(0, limit)" :key="row.id" :row="row" :display="display"
                :open="expanded === row.id" :dom-complete="dom.complete" :html-complete="html?.complete"
                @update:open="setExpanded(row.id, $event)" @copy="emit('copy', $event)"
              />
              <p v-if="!filtered.length" class="empty-section">
                当前筛选下没有匹配字段。
              </p>
              <UiActionButton v-if="filtered.length > limit" size="sm" @click="limit += 50">
                再显示 50 项
              </UiActionButton>
            </template>
          </div>
        </UiTabPanel>
      </template>
      <p v-else-if="status !== 'loading' && !error" class="empty-section">
        打开 HTTP(S) 页面后读取 SEO 数据。
      </p>
    </section>
  </UiTabs>
</template>
