import type { ObjectDirective } from 'vue'
import type { UiAnimation } from '@/libs/motion'
import { animateUi, motionDuration } from '@/libs/motion'

interface ResizeState {
  animation?: UiAnimation
  from?: { height: number, width: number }
  preference: MediaQueryList
  stop: () => void
}
const states = new WeakMap<HTMLElement, ResizeState>()

// 只在指定状态切换时测量两次尺寸，不逐帧读取布局，也不观察自身动画尺寸。
// 完成或取消后交回自然布局，避免异步内容、面板缩放和快速切换留下固定高度。
export const vResizeMotion: ObjectDirective<HTMLElement, unknown> = {
  mounted(element) {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const state: ResizeState = {
      preference,
      stop() {
        state.animation?.cancel()
        state.animation = undefined
        window.removeEventListener('resize', state.stop)
      },
    }
    preference.addEventListener('change', state.stop)
    states.set(element, state)
  },
  beforeUpdate(element, binding) {
    const state = states.get(element)
    if (!state || Object.is(binding.value, binding.oldValue))
      return
    const bounds = element.getBoundingClientRect()
    state.from = { height: bounds.height, width: bounds.width }
    state.stop()
  },
  updated(element, binding) {
    const state = states.get(element)
    const from = state?.from
    if (!state || !from)
      return
    state.from = undefined
    const to = element.getBoundingClientRect()
    const dimension = binding.modifiers.inline ? 'width' : 'height'
    if (state.preference.matches || !from[dimension] || !to[dimension]
      || Math.abs(from[dimension] - to[dimension]) < 1
      || element.closest('[data-motion-presence]')) {
      return
    }
    let completed = false
    const animation = animateUi(element, { [dimension]: [`${from[dimension]}px`, `${to[dimension]}px`] }, {
      duration: motionDuration.resize,
      styles: { overflow: 'clip' },
      onComplete() {
        completed = true
        state.stop()
      },
    })
    if (!completed) {
      state.animation = animation
      window.addEventListener('resize', state.stop, { once: true })
    }
  },
  beforeUnmount(element) {
    const state = states.get(element)
    state?.stop()
    state?.preference.removeEventListener('change', state.stop)
    states.delete(element)
  },
}
