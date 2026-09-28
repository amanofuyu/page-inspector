<script setup lang="ts">
import type { CollectedApp, PageSnapshot } from '../nuxt/types'
import type { NetworkApi, NetworkRecord } from './session'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import ExpandTransition from '../inspector/ExpandTransition.vue'
import { vResizeMotion } from '../inspector/motion'
import { parseApp } from '../nuxt/parse'
import { associate, NetworkSession, responseSnapshot } from './session'

const props = defineProps<{
  active: boolean
  snapshot?: PageSnapshot | null
  app?: CollectedApp
  documentId?: string | null
  tabId?: number
}>()
const emit = defineEmits<{
  notice: [
        message: string,
  ]
  inspect: [
        value: ReturnType<typeof responseSnapshot>,
  ]
  refresh: [
  ]
}>()
function reloadPage() {
  chrome.devtools.inspectedWindow.reload()
}
const revision = ref(0)
const session = new NetworkSession(() => {
  revision.value++
})
watch(() => [props.documentId, props.snapshot?.navigationStartedAt] as const, ([documentId, startedAt]) => {
  if (documentId && startedAt !== undefined)
    session.setDocument(documentId, startedAt)
}, { immediate: true })
const selectedId = ref('')
const filter = ref('')
const preserve = ref(false)
const previewLimit = ref(8000)
const rows = computed(() => {
  void revision.value
  return session.records.filter(record => record.url.toLowerCase().includes(filter.value.toLowerCase())).slice().reverse()
})
const selected = computed(() => {
  void revision.value
  return session.records.find(record => record.id === selectedId.value)
})
const body = computed(() => {
  void revision.value
  return selectedId.value ? session.body(selectedId.value) : undefined
})
const association = computed(() => selected.value ? associate(selected.value, body.value, props.snapshot, props.app, props.documentId) : null)
const startupError = ref('')
const inspecting = ref(false)
const readySnapshot = shallowRef<ReturnType<typeof responseSnapshot> | null>(null)
function size(bytes: number | null | undefined) {
  return bytes == null ? '未知' : bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KiB`
}
function choose(record: NetworkRecord) {
  selectedId.value = record.id
  previewLimit.value = 8000
  readySnapshot.value = null
}
function level(record: NetworkRecord) {
  return associate(record, session.body(record.id), props.snapshot, props.app, props.documentId).level
}
async function read() {
  if (!selected.value)
    return
  try {
    await session.read(selected.value.id)
  }
  catch (failure) {
    emit('notice', failure instanceof Error ? failure.message : String(failure))
  }
}
async function copyUrl() {
  try {
    await navigator.clipboard.writeText(selected.value!.url)
    emit('notice', '已复制完整请求 URL')
  }
  catch {
    emit('notice', '复制失败。')
  }
}
async function inspect() {
  if (!selected.value || !body.value)
    return
  inspecting.value = true
  try {
    const next = responseSnapshot(selected.value, body.value, props.snapshot)
    // 显式选择后才验证；解析器继续执行相同的 payload 大小和格式约束。
    if (!parseApp(next.app).payload)
      throw new Error('响应不是支持的 Nuxt JSON payload，仍可查看正文。')
    readySnapshot.value = next
    emit('inspect', next)
  }
  catch (failure) {
    emit('notice', failure instanceof Error ? failure.message : String(failure))
  }
  finally {
    inspecting.value = false
  }
}
onMounted(() => {
  if (!chrome.devtools?.network) {
    startupError.value = '网络观察仅可在真实开发者工具面板中使用。'
    return
  }
  session.start(chrome.devtools.network as unknown as NetworkApi)
})
onBeforeUnmount(() => session.dispose())
</script>

<template>
  <section v-show="active" class="feature-card glass-card network-card" aria-label="DevTools 网络">
    <div class="feature-heading">
      <h2>浏览器观察到的请求</h2><span class="feature-caption">固定标签页 {{ tabId }}</span>
    </div>
    <p class="feature-caption">
      {{ new Date(session.observedAt).toLocaleTimeString() }} 开始观察。晚打开 DevTools 可能缺少历史请求，SSR 服务端 API 调用在此不可见。
    </p>
    <p v-if="startupError" class="notice notice-warning">
      {{ startupError }}
    </p>
    <div class="feature-toolbar">
      <label class="checkbox-label"><input v-model="preserve" type="checkbox" @change="session.preserve = preserve">保留导航前记录</label><button class="btn btn-sm btn-ghost" @click="session.clear()">
        清空记录
      </button><button class="btn btn-sm btn-ghost" @click="reloadPage">
        刷新被检查页面
      </button>
    </div>
    <input v-model="filter" class="input input-sm w-full" aria-label="筛选请求 URL" placeholder="筛选完整 URL">
    <p class="feature-caption">
      {{ session.records.length }} / 500 条 · 元信息 {{ size(session.metadataBytes) }} / 2 MiB · 正文缓存 {{ size(session.bodyBytes) }} / 12 MiB<span v-if="session.dropped"> · 已释放／忽略 {{ session.dropped }} 条</span>
    </p>
    <div class="network-columns">
      <div class="network-list">
        <button v-for="record in rows" :key="record.id" class="request-row" :class="{ selected: record.id === selectedId }" @click="choose(record)">
          <span>{{ record.method }} · {{ record.status ?? '?' }} · {{ record.generation === null ? '页面归属未确认' : `页面 ${record.generation + 1}` }} · {{ level(record) }}</span><span class="mono break-text">{{ record.url }}</span><small>{{ record.mime || record.resourceType || '类型未知' }} · content.size {{ size(record.contentSize) }} · {{ record.durationMs?.toFixed(0) ?? '?' }} ms</small>
        </button>
        <p v-if="!rows.length" class="empty-section">
          当前没有记录。可以刷新页面或在应用中触发客户端请求。
        </p>
      </div>
      <ExpandTransition>
        <aside v-if="selected" v-resize-motion="`${selectedId}:${selected.bodyState}:${previewLimit}`" class="network-detail" aria-label="请求详情">
          <div class="feature-heading">
            <h3>{{ association?.level }}</h3><button class="btn btn-xs btn-ghost" @click="copyUrl">
              复制 URL
            </button>
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
          <p v-if="selected.ambiguous" class="notice notice-warning">
            历史记录与实时事件有重复歧义，不确认为同一文档来源。
          </p>
          <div class="feature-toolbar">
            <button class="btn btn-sm btn-primary" :disabled="selected.bodyState === 'loading' || selected.contentSize === null || selected.contentSize > 12582912" @click="read">
              {{ selected.bodyState === 'loading' ? '读取中…' : body ? '正文已读取' : '读取响应正文' }}
            </button><button class="btn btn-sm btn-ghost" @click="selected.manualCandidate = !selected.manualCandidate; revision++">
              {{ selected.manualCandidate ? '取消业务候选' : '标记为业务候选' }}
            </button>
          </div>
          <p v-if="selected.contentSize === null" class="feature-caption">
            正文大小未知，默认只展示元信息。
          </p><p v-if="selected.bodyError" class="notice notice-warning">
            {{ selected.bodyError }}
          </p>
          <template v-if="body">
            <div class="feature-toolbar">
              <span class="feature-caption">编码 {{ body.encoding }} · {{ size(body.bytes) }}</span><button class="btn btn-sm btn-ghost" :disabled="inspecting" @click="inspect">
                作为独立 payload 查看
              </button>
            </div><pre class="response-preview">{{ body.text.slice(0, previewLimit) }}</pre><button v-if="body.text.length > previewLimit" class="btn btn-xs btn-ghost" @click="previewLimit += 8000">
              再显示 8,000 字符
            </button><details v-if="association?.source">
              <summary>与已采集来源比较</summary><p class="feature-caption">
                {{ body.text === association.source.text ? '完整文本一致' : '完整文本不同，以下仅为来源预览' }} · {{ association.source.transport }}
              </p><pre class="response-preview">{{ association.source.text?.slice(0, 8000) ?? '来源正文不可用' }}</pre>
            </details>
          </template>
        </aside>
      </ExpandTransition>
    </div>
  </section>
</template>
