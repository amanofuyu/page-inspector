import type { ObjectDirective } from 'vue'

interface ResizeState {
  animation?: Animation
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
      || element.closest('.expand-enter-active, .expand-leave-active')) {
      return
    }
    const styles = getComputedStyle(element)
    // 构建压缩可能把毫秒改写为秒，交给 Web Animations 前统一换算为毫秒。
    const time = styles.getPropertyValue('--motion-resize').trim()
    const duration = Number.parseFloat(time) * (time.endsWith('ms') ? 1 : 1000)
    const animation = element.animate([
      { [dimension]: `${from[dimension]}px`, overflow: 'clip' },
      { [dimension]: `${to[dimension]}px`, overflow: 'clip' },
    ], {
      duration: Number.isFinite(duration) ? duration : 240,
      easing: styles.getPropertyValue('--motion-ease').trim() || 'ease-out',
    })
    state.animation = animation
    window.addEventListener('resize', state.stop, { once: true })
    void animation.finished.then(() => {
      if (state.animation === animation)
        state.stop()
    }).catch(() => {})
  },
  beforeUnmount(element) {
    const state = states.get(element)
    state?.stop()
    state?.preference.removeEventListener('change', state.stop)
    states.delete(element)
  },
}
