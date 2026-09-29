<script setup lang="ts">
import type { CollectedApp } from '../nuxt/types'
import { ChevronRight, Clock3, FileJson, Info, LockKeyhole, X } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'

const props = defineProps<{
  title: string
  url: string
  captureTime: string
  renderLabel?: string
  application?: CollectedApp
  initialUrl?: string | null
}>()
const open = defineModel<boolean>('open', { required: true })
const dialog = ref<HTMLDialogElement | null>(null)
const totalBytes = computed(() => props.application?.sources.reduce((total, source) => total + source.bytes, 0) ?? 0)
const backdropPressed = ref(false)
function syncDialog() {
  if (open.value && !dialog.value?.open)
    dialog.value?.showModal()
  else if (!open.value && dialog.value?.open)
    dialog.value.close()
}
function onClose() {
  // 忽略快速重新打开之前排队的关闭事件。
  if (!dialog.value?.open)
    open.value = false
}
function onBackdropClick(event: MouseEvent) {
  if (backdropPressed.value && event.target === dialog.value)
    open.value = false
}
function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`
}
// 原生模态框负责限制背景交互、约束键盘焦点，并在关闭后恢复触发入口的焦点。
watch(open, syncDialog, { flush: 'post' })
onMounted(syncDialog)
</script>

<template>
  <dialog
    id="page-context" ref="dialog" class="page-context" aria-labelledby="page-context-title" aria-describedby="page-context-description"
    @cancel.prevent="open = false" @close="onClose"
    @pointerdown="backdropPressed = $event.target === $event.currentTarget" @click="onBackdropClick"
  >
    <div class="context-dialog-surface">
      <header class="context-dialog-header">
        <span class="context-dialog-icon"><Info :size="20" aria-hidden="true" /></span>
        <div class="context-dialog-heading">
          <h2 id="page-context-title">
            页面与数据来源
          </h2>
          <p id="page-context-description">
            查看页面信息、采集来源与展示范围
          </p>
        </div>
        <UiActionButton icon-only class="context-dialog-close" label="关闭页面信息" autofocus @click="open = false">
          <X :size="18" aria-hidden="true" />
        </UiActionButton>
      </header>
      <div class="context-dialog-body" tabindex="0" role="region" aria-label="页面信息内容">
        <section class="context-page" aria-labelledby="context-page-heading">
          <h3 id="context-page-heading" class="context-section-label">
            当前页面
          </h3>
          <p class="page-title">
            {{ title }}
          </p>
          <p class="page-url">
            {{ url || '等待当前标签页…' }}
          </p>
          <div class="context-capture">
            <span class="capture-time"><Clock3 :size="13" aria-hidden="true" />{{ captureTime ? `${captureTime} 采集` : '等待采集' }}</span>
            <span v-if="renderLabel" class="context-render-label">{{ renderLabel }}</span>
          </div>
        </section>
        <template v-if="application">
          <details class="source-details disclosure-section context-sources" open>
            <summary class="disclosure-summary">
              <ChevronRight class="disclosure-chevron" :size="14" aria-hidden="true" />
              <span>数据来源</span>
              <span class="context-source-count">{{ application.sources.length }} 项 · {{ size(totalBytes) }}</span>
            </summary>
            <div class="context-sources-content">
              <div class="context-initial-document">
                <span class="context-section-label">初始文档</span>
                <p class="context-url">
                  {{ initialUrl || '无法确认' }}
                </p>
              </div>
              <ul class="context-source-list">
                <li v-for="(item, index) in application.sources" :key="index" class="context-source-item">
                  <div class="context-source-heading">
                    <FileJson :size="15" aria-hidden="true" />
                    <strong>{{ item.kind === 'inline' ? '页面内嵌' : '外部 payload' }}</strong>
                    <span class="context-source-size">{{ size(item.bytes) }}</span>
                  </div>
                  <p class="context-url">
                    {{ item.url || '当前文档' }}
                  </p>
                  <p class="context-source-time">
                    {{ new Date(item.fetchedAt).toLocaleString() }}
                  </p>
                </li>
              </ul>
            </div>
          </details>
          <section class="context-scope" aria-labelledby="context-scope-heading">
            <h3 id="context-scope-heading" class="context-section-label">
              展示与导出范围
            </h3>
            <p>仅展示初始 payload，不包含页面运行时状态和独立运行时配置。</p>
            <p>视图导出保留类型与引用标记；原文导出保留采集文本。</p>
            <p v-if="application.externalUrl" class="context-source-warning">
              外部资源为本次重新获取，无法保证与最初 HTML 的版本完全一致。
            </p>
          </section>
        </template>
      </div>
      <footer class="context-dialog-footer">
        <p class="privacy-note">
          <LockKeyhole :size="13" aria-hidden="true" />数据仅在本地查看
        </p>
        <UiActionButton size="sm" @click="open = false">
          知道了
        </UiActionButton>
      </footer>
    </div>
  </dialog>
</template>
