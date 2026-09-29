import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useToast } from '../composables/useToast'

let scope: ReturnType<typeof effectScope>
let state: ReturnType<typeof useToast>
beforeEach(() => {
  vi.useFakeTimers()
  scope = effectScope()
  state = scope.run(useToast)!
})
afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})

describe('操作提示计时与生命周期', () => {
  it('相同文案再次出现时重新计时，旧倒计时不会关闭新提示', () => {
    state.show('已复制')
    const first = state.toast.value!.id
    vi.advanceTimersByTime(4000)
    state.show('已复制')
    expect(state.toast.value!.id).toBeGreaterThan(first)
    vi.advanceTimersByTime(4999)
    expect(state.toast.value?.message).toBe('已复制')
    vi.advanceTimersByTime(1)
    expect(state.toast.value).toBeNull()
  })

  it('鼠标与焦点分别暂停，全部离开后只继续剩余时间', () => {
    state.show('操作提示')
    vi.advanceTimersByTime(2000)
    state.pause('pointer')
    vi.advanceTimersByTime(6000)
    state.pause('focus')
    state.resume('pointer')
    vi.advanceTimersByTime(6000)
    expect(state.toast.value).not.toBeNull()
    state.resume('focus')
    vi.advanceTimersByTime(2999)
    expect(state.toast.value).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(state.toast.value).toBeNull()
  })

  it('暂停期间用新提示替换旧提示，恢复后得到完整阅读时间', () => {
    state.show('已复制')
    vi.advanceTimersByTime(2500)
    state.pause('pointer')
    state.show('已发起下载')
    vi.advanceTimersByTime(10000)
    expect(state.toast.value?.message).toBe('已发起下载')
    state.resume('pointer')
    vi.advanceTimersByTime(4999)
    expect(state.toast.value?.message).toBe('已发起下载')
    vi.advanceTimersByTime(1)
    expect(state.toast.value).toBeNull()
  })

  it('手动关闭清理暂停状态，卸载释放计时器并忽略迟到提示', () => {
    state.show('已复制')
    state.pause('focus')
    state.dismiss()
    expect(state.toast.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    state.show('已发起下载')
    expect(vi.getTimerCount()).toBe(1)
    scope.stop()
    expect(state.toast.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    state.show('迟到的提示')
    expect(state.toast.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
