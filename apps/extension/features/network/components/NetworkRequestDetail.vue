<script setup lang="ts">
import type { Association, NetworkRecord, ResponseBody } from '../session'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import UiDisclosure from '@/components/ui/UiDisclosure.vue'
import UiNotice from '@/components/ui/UiNotice.vue'
import { formatBytes as size } from '../../inspector/format'
import { vResizeMotion } from '../../inspector/motion'

defineProps<{ selected: NetworkRecord, association: Association, body?: ResponseBody, previewLimit: number }>()
const emit = defineEmits<{
  copy: [url: string]
  read: [id: string]
  candidate: [id: string]
  inspect: [id: string]
  more: []
}>()
</script>

<template>
  <aside v-resize-motion="`${selected.id}:${selected.bodyState}:${previewLimit}`" class="network-detail" aria-label="请求详情">
    <div class="feature-heading">
      <h3>{{ association?.level }}</h3><UiActionButton @click="emit('copy', selected.url)">
        复制 URL
      </UiActionButton>
    </div>
    <p class="mono break-text">
      {{ selected.url }}
    </p><p class="feature-caption">
      {{ association?.reason }}
    </p>
    <dl class="request-facts">
      <dt>方法 / 状态</dt><dd>{{ selected.method }} / {{ selected.status ?? '未知' }}</dd><dt>开始 / 耗时</dt><dd>{{ selected.startedAt ? new Date(selected.startedAt).toLocaleTimeString() : '未知' }} / {{ selected.durationMs ?? '未知' }} ms</dd><dt>资源 / MIME</dt><dd>{{ selected.resourceType || '未知' }} / {{ selected.mime || '未知' }}</dd><dt>HAR content.size</dt><dd>{{ size(selected.contentSize) }}（内容大小）</dd><dt>HAR bodySize</dt><dd>{{ size(selected.bodySize) }}（传输正文；不含头）</dd><dt>文本 UTF-8</dt><dd>{{ size(selected.bodyUtf8Bytes) }}</dd><dt>HAR 页面</dt><dd>{{ selected.pageRef || '未知' }} / {{ selected.pageStartedAt ? new Date(selected.pageStartedAt).toLocaleTimeString() : '归属未确认' }}</dd>
    </dl>
    <p class="feature-caption">
      缓存、304 与压缩会影响大小字段；0 不自动等于无正文，未知值不参与体积求和。浏览器响应与扩展重新获取内容分别保存。
    </p>
    <p v-if="selected.redirectUrl" class="feature-caption break-text">
      重定向：{{ selected.redirectUrl }}，链路未经核实。
    </p>
    <UiNotice v-if="selected.ambiguous" severity="warning">
      历史记录与实时事件有重复歧义，不确认为同一文档来源。
    </UiNotice>
    <div class="feature-toolbar">
      <UiActionButton :disabled="selected.bodyState === 'loading' || selected.contentSize === null || selected.contentSize > 12582912" size="sm" variant="primary" @click="emit('read', selected.id)">
        {{ selected.bodyState === 'loading' ? '读取中…' : body ? '正文已读取' : '读取响应正文' }}
      </UiActionButton><UiActionButton size="sm" @click="emit('candidate', selected.id)">
        {{ selected.manualCandidate ? '取消业务候选' : '标记为业务候选' }}
      </UiActionButton>
    </div>
    <p v-if="selected.contentSize === null" class="feature-caption">
      正文大小未知，默认只展示元信息。
    </p><UiNotice v-if="selected.bodyError" severity="error">
      {{ selected.bodyError }}
    </UiNotice>
    <template v-if="body">
      <div class="feature-toolbar">
        <span class="feature-caption">编码 {{ body.encoding }} · {{ size(body.bytes) }}</span><UiActionButton size="sm" @click="emit('inspect', selected.id)">
          作为独立 payload 查看
        </UiActionButton>
      </div><pre class="response-preview">{{ body.text.slice(0, previewLimit) }}</pre><UiActionButton v-if="body.text.length > previewLimit" @click="emit('more')">
        再显示 8,000 字符
      </UiActionButton><UiDisclosure v-if="association?.source" class="disclosure-section">
        <template #label>
          <span>与已采集来源比较</span>
        </template><p class="feature-caption">
          {{ body.text === association.source.text ? '完整文本一致' : '完整文本不同，以下仅为来源预览' }} · {{ association.source.transport }}
        </p><pre class="response-preview">{{ association.source.text?.slice(0, 8000) ?? '来源正文不可用' }}</pre>
      </UiDisclosure>
    </template>
  </aside>
</template>
