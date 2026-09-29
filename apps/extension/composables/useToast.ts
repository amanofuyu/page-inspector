import { onScopeDispose, shallowRef } from 'vue'

export type ToastKind = 'success' | 'error' | 'warning' | 'info'
export interface ToastInput {
  message: string
  kind: ToastKind
}
export interface ToastMessage extends ToastInput {
  id: number
}
export type ToastPauseReason = 'pointer' | 'focus'
const DURATION = 5000

export function useToast() {
  const toast = shallowRef<ToastMessage | null>(null)
  const pauses = new Set<ToastPauseReason>()
  let sequence = 0
  let remaining = DURATION
  let startedAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  function stopTimer() {
    clearTimeout(timer)
    timer = undefined
  }
  function dismiss() {
    stopTimer()
    pauses.clear()
    toast.value = null
  }
  function schedule() {
    stopTimer()
    if (!toast.value || pauses.size || disposed)
      return
    const id = toast.value.id
    startedAt = Date.now()
    timer = setTimeout(() => {
      if (toast.value?.id === id)
        dismiss()
    }, remaining)
  }
  function show(input: ToastInput | string) {
    const { message, kind } = typeof input === 'string' ? { message: input, kind: 'info' as const } : input
    if (disposed || !message.trim())
      return
    // 每次操作都有新标识，同文案再次出现也刷新倒计时与读屏播报。
    toast.value = { id: ++sequence, message, kind }
    remaining = DURATION
    schedule()
  }
  function pause(reason: ToastPauseReason) {
    if (pauses.has(reason))
      return
    pauses.add(reason)
    if (timer !== undefined)
      remaining = Math.max(0, remaining - (Date.now() - startedAt))
    stopTimer()
  }
  function resume(reason: ToastPauseReason) {
    if (pauses.delete(reason))
      schedule()
  }
  onScopeDispose(() => {
    disposed = true
    dismiss()
  })
  return { toast, show, dismiss, pause, resume }
}
