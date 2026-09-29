<script setup lang="ts">
import type { ToastMessage, ToastPauseReason } from '@/composables/useToast'
import { CircleCheck, CircleX, Info, TriangleAlert, X } from '@lucide/vue'
import { ref, watch } from 'vue'

const props = defineProps<{ toast: ToastMessage | null }>()
const emit = defineEmits<{
  dismiss: []
  pause: [reason: ToastPauseReason]
  resume: [reason: ToastPauseReason]
}>()
const region = ref<HTMLElement | null>(null)
const appearances = {
  success: { icon: CircleCheck, label: '成功' },
  error: { icon: CircleX, label: '失败' },
  warning: { icon: TriangleAlert, label: '警告' },
  info: { icon: Info, label: '信息' },
}
let previousFocus: HTMLElement | null = null
function syncInteraction() {
  const card = region.value?.querySelector<HTMLElement>('.inspector-toast')
  if (props.toast && card?.matches(':hover'))
    emit('pause', 'pointer')
  else
    emit('resume', 'pointer')
  if (props.toast && card?.contains(document.activeElement))
    emit('pause', 'focus')
  else
    emit('resume', 'focus')
}
watch(() => props.toast?.id, (id) => {
  if (id && document.activeElement instanceof HTMLElement && !region.value?.contains(document.activeElement))
    previousFocus = document.activeElement
  // 关闭后清理暂停状态；新提示出现在原鼠标位置时也正确暂停。
  syncInteraction()
}, { flush: 'post' })
function dismiss() {
  if (region.value?.contains(document.activeElement) && previousFocus?.isConnected)
    previousFocus.focus({ preventScroll: true })
  emit('dismiss')
}
function leave(element: Element) {
  element.setAttribute('inert', '')
}
function restore(element: Element) {
  element.removeAttribute('inert')
}
</script>

<template>
  <div ref="region" class="toast-region" role="status" aria-live="polite" aria-atomic="true">
    <Transition name="toast" @before-leave="leave" @after-leave="restore" @leave-cancelled="restore">
      <div v-if="toast" class="inspector-toast" :data-kind="toast.kind" @mouseenter="emit('pause', 'pointer')" @mouseleave="emit('resume', 'pointer')" @focusin="emit('pause', 'focus')" @focusout="syncInteraction" @keydown.esc.stop.prevent="dismiss">
        <span class="sr-only">{{ appearances[toast.kind].label }}：</span>
        <component :is="appearances[toast.kind].icon" class="toast-icon" :size="18" aria-hidden="true" />
        <p :key="toast.id" class="toast-message">
          {{ toast.message }}
        </p>
        <button type="button" class="btn btn-ghost btn-xs toast-close" aria-label="关闭提示" title="关闭提示" @click="dismiss">
          <X :size="14" aria-hidden="true" />
        </button>
      </div>
    </Transition>
  </div>
</template>
