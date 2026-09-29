<script setup lang="ts">
import type { NetworkViewInput } from './useNetworkViewState'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import ExpandTransition from '../inspector/ExpandTransition.vue'
import { formatBytes as size } from '../inspector/format'
import NetworkRequestDetail from './components/NetworkRequestDetail.vue'
import { useNetworkViewState } from './useNetworkViewState'

const props = defineProps<NetworkViewInput & { startupError: string, active: boolean, tabId?: number }>()
const emit = defineEmits<{
  read: [id: string]
  inspect: [id: string]
  copy: [text: string]
  clear: []
  reload: []
  candidate: [id: string]
  preserve: [value: boolean]
}>()
const { selectedId, filter, previewLimit, rows, selected, body, choose } = useNetworkViewState(props)
</script>

<template>
  <section v-show="active" class="feature-card glass-card network-card" aria-label="DevTools 网络">
    <div class="feature-heading">
      <h2>浏览器观察到的请求</h2><span class="feature-caption">固定标签页 {{ tabId }}</span>
    </div>
    <p class="feature-caption">
      {{ new Date(session.observedAt).toLocaleTimeString() }} 开始观察。晚打开 DevTools 可能缺少历史请求，SSR 服务端 API 调用在此不可见。
    </p>
    <p v-if="startupError" class="notice notice-error">
      {{ startupError }}
    </p>
    <div class="feature-toolbar">
      <label class="checkbox-label"><input :checked="session.preserve" type="checkbox" @change="emit('preserve', ($event.target as HTMLInputElement).checked)">保留导航前记录</label><UiActionButton size="sm" @click="emit('clear')">
        清空记录
      </UiActionButton><UiActionButton size="sm" @click="emit('reload')">
        刷新被检查页面
      </UiActionButton>
    </div>
    <input v-model="filter" class="input input-sm w-full" aria-label="筛选请求 URL" placeholder="筛选完整 URL">
    <p class="feature-caption">
      {{ session.records.length }} / 500 条 · 元信息 {{ size(session.metadataBytes) }} / 2 MiB · 正文缓存 {{ size(session.bodyBytes) }} / 12 MiB<span v-if="session.dropped"> · 已释放／忽略 {{ session.dropped }} 条</span>
    </p>
    <div class="network-columns">
      <div class="network-list">
        <button v-for="{ record, association } in rows" :key="record.id" class="request-row" :class="{ selected: record.id === selectedId }" @click="choose(record.id)">
          <span>{{ record.method }} · {{ record.status ?? '?' }} · {{ record.generation === null ? '页面归属未确认' : `页面 ${record.generation + 1}` }} · {{ association.level }}</span><span class="mono break-text">{{ record.url }}</span><small>{{ record.mime || record.resourceType || '类型未知' }} · content.size {{ size(record.contentSize) }} · {{ record.durationMs?.toFixed(0) ?? '?' }} ms</small>
        </button>
        <p v-if="!rows.length" class="empty-section">
          当前没有记录。可以刷新页面或在应用中触发客户端请求。
        </p>
      </div>
      <ExpandTransition>
        <NetworkRequestDetail v-if="selected" :selected="selected.record" :association="selected.association" :body="body" :preview-limit="previewLimit" @copy="emit('copy', $event)" @read="emit('read', $event)" @candidate="emit('candidate', $event)" @inspect="emit('inspect', $event)" @more="previewLimit += 8000" />
      </ExpandTransition>
    </div>
  </section>
</template>
