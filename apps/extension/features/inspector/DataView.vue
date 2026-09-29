<script setup lang="ts">
import type { FieldPath } from '../inspection/model'
import type { DataNode, DataTree } from '../nuxt/format'
import type { CollectedApp, ParsedApp, RawSource } from '../nuxt/types'
import type { FieldDetailData } from './useFieldDetails'
import type { UiSplitPaneSize } from '@/components/ui/split-pane'
import type { ToastInput } from '@/composables/useToast'
import { Download, PanelRight } from '@lucide/vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiNotice from '@/components/ui/UiNotice.vue'
import UiSearchInput from '@/components/ui/UiSearchInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSplitPane from '@/components/ui/UiSplitPane.vue'
import UiTabList from '@/components/ui/UiTabList.vue'
import UiTabPanel from '@/components/ui/UiTabPanel.vue'
import UiTabs from '@/components/ui/UiTabs.vue'
import DataTreeNode from './DataTreeNode.vue'
import FieldDetailPanel from './FieldDetailPanel.vue'
import RawViewer from './RawViewer.vue'
import { PAYLOAD_VIEWS } from './usePayloadViewState'

defineProps<{
  application: CollectedApp
  parsed: ParsedApp
  tree: DataTree | null
  source?: RawSource
  selectedNode?: DataNode
  focusedNode?: DataNode
  search: string
  found: { matches: DataNode[], limited: boolean }
  selectionContext: string
  dataDetail: FieldDetailData
  watchedPaths: ReadonlySet<string>
  pendingWatchPaths: ReadonlySet<string>
}>()
const emit = defineEmits<{
  export: []
  select: [node: DataNode]
  notice: [notice: ToastInput]
  watch: [path: FieldPath]
}>()
const view = defineModel<string>('view', { required: true })
const query = defineModel<string>('query', { required: true })
const sourceIndex = defineModel<number>('sourceIndex', { required: true })
const detailVisible = defineModel<boolean>('detailVisible', { required: true })
const splitSize = defineModel<UiSplitPaneSize>('splitSize', { required: true })
</script>

<template>
  <UiTabs v-model="view" :items="PAYLOAD_VIEWS">
    <section class="data-card" aria-label="Payload 数据">
      <UiNotice v-if="parsed.diagnostics.length" class="diagnostics" severity="warning">
        <p v-for="diagnostic in parsed.diagnostics" :key="diagnostic">
          {{ diagnostic }}
        </p>
      </UiNotice>
      <UiTabList label="数据分类" />
      <UiTabPanel :value="view">
        <div class="data-tab-panel">
          <div class="viewer-toolbar">
            <UiSearchInput v-if="view !== 'raw'" v-model="query" placeholder="搜索键、值或类型" label="搜索当前分类" :disabled="!selectedNode" />
            <UiSelect v-else v-model="sourceIndex" :items="application.sources.map((item, index) => ({ value: index, label: item.kind === 'inline' ? '内嵌原文' : '外部原文' }))" class="flex-1 min-w-0" label="原文来源" />
            <UiActionButton v-if="view !== 'raw'" class="detail-toggle" :disabled="!focusedNode" :aria-pressed="detailVisible" aria-controls="data-field-detail" size="sm" @click="detailVisible = !detailVisible">
              <PanelRight :size="14" aria-hidden="true" />详情
            </UiActionButton>
            <UiActionButton class="export-button" :disabled="view === 'raw' ? source?.text == null : !selectedNode" :tooltip="view === 'raw' ? '导出完整已采集原文' : '导出带类型的当前视图'" size="sm" @click="emit('export')">
              <Download :size="14" aria-hidden="true" />导出
            </UiActionButton>
          </div>

          <RawViewer v-if="view === 'raw' && source" :source="source" />
          <UiEmptyState v-else-if="!selectedNode">
            <p>{{ parsed.payload ? '此 payload 没有该字段。' : '数据暂时无法解析，请切换到原文查看。' }}</p>
            <template v-if="!parsed.payload" #actions>
              <UiActionButton @click="view = 'raw'">
                查看原文
              </UiActionButton>
            </template>
          </UiEmptyState>
          <UiSplitPane v-else v-model="splitSize" class="data-explorer" label="调整数据树与字段详情比例" :secondary-visible="detailVisible && !!focusedNode">
            <section class="data-tree-pane" aria-label="数据树">
              <div class="detail-pane-heading">
                <h2>数据树</h2><span>{{ tree?.count.toLocaleString() }} 个已展示节点</span>
              </div>
              <div :key="search.trim() ? 'search' : selectionContext" :class="search.trim() ? 'search-results' : 'tree-container'">
                <UiNotice v-if="tree?.truncated" class="view-limit-notice" severity="warning" aria-label="视图限制提示">
                  <div class="view-limit-content">
                    <div class="view-limit-heading">
                      <h3>视图已达展示上限</h3>
                      <span class="view-limit-threshold">已限制为 <strong>10,000</strong> 个节点 / <strong>60</strong> 层</span>
                    </div>
                    <p>搜索与视图导出仅包含已展示的数据，完整已采集内容请导出原文。</p>
                  </div>
                </UiNotice>
                <template v-if="search.trim()">
                  <p class="result-count" role="status">
                    {{ found.matches.length }} 条匹配{{ found.limited ? '（仅显示前 100 条）' : '' }}
                  </p>
                  <div v-for="node in found.matches" :key="node.path" class="search-result">
                    <p class="result-path">
                      {{ node.path }}
                    </p>
                    <DataTreeNode :node="node" selectable :selected-path="detailVisible ? focusedNode?.path : undefined" @select="emit('select', $event)" />
                  </div>
                  <UiEmptyState v-if="!found.matches.length">
                    没有匹配的字段，试试其他关键词。
                  </UiEmptyState>
                </template>
                <DataTreeNode v-else :key="selectionContext" :node="selectedNode" initial-open selectable :selected-path="detailVisible ? focusedNode?.path : undefined" @select="emit('select', $event)" />
              </div>
            </section>
            <template #secondary>
              <FieldDetailPanel id="data-field-detail" v-bind="dataDetail" :node="focusedNode" :watched-paths="watchedPaths" :pending-watch-paths="pendingWatchPaths" @close="detailVisible = false" @notice="emit('notice', $event)" @watch="emit('watch', $event)" />
            </template>
          </UiSplitPane>
        </div>
      </UiTabPanel>
    </section>
  </UiTabs>
</template>
