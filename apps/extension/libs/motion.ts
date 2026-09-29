import type { DOMKeyframesDefinition } from 'motion-v'
import { usePreferredReducedMotion } from '@vueuse/core'
import { animateMini } from 'motion-v'
import { computed } from 'vue'

export const motionEase = [0.22, 1, 0.36, 1] as const
export const motionDuration = { feedback: 0.16, enter: 0.22, resize: 0.24 }

export function useMotionPreferences() {
  const preference = usePreferredReducedMotion()
  const reduced = computed(() => preference.value === 'reduce')
  const transition = computed(() => ({ duration: reduced.value ? 0 : motionDuration.enter, ease: motionEase }))
  return { reduced, transition }
}

export interface UiAnimation {
  cancel: () => void
  finish: () => void
}

// 临时动效结束后恢复原样式，把尺寸和定位交还布局；快速切换时可安全取消。
export function animateUi(
  element: HTMLElement,
  keyframes: DOMKeyframesDefinition,
  options: { duration?: number, styles?: Record<string, string>, onComplete?: () => void } = {},
): UiAnimation {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (preference.matches || typeof element.animate !== 'function') {
    options.onComplete?.()
    return { cancel() {}, finish() {} }
  }
  const properties = [...new Set([...Object.keys(keyframes), ...Object.keys(options.styles ?? {})])]
    .map(key => key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`))
  const original = properties.map(key => [key, element.style.getPropertyValue(key), element.style.getPropertyPriority(key)] as const)
  let settled = false
  let controls: ReturnType<typeof animateMini> | undefined
  function settle(complete: boolean) {
    if (settled)
      return
    settled = true
    preference.removeEventListener('change', onPreferenceChange)
    controls?.cancel()
    for (const [key, value, priority] of original) {
      if (value)
        element.style.setProperty(key, value, priority)
      else
        element.style.removeProperty(key)
    }
    if (complete)
      options.onComplete?.()
  }
  function onPreferenceChange() {
    if (preference.matches)
      settle(true)
  }
  for (const [key, value] of Object.entries(options.styles ?? {}))
    element.style.setProperty(key, value)
  // 原生 CSS 属性使用 Motion 的 WAAPI 引擎，避免混合引擎的延迟渲染覆盖清理后的自然尺寸。
  controls = animateMini([element], keyframes, { duration: options.duration ?? motionDuration.enter, ease: motionEase })
  preference.addEventListener('change', onPreferenceChange)
  void controls.then(() => settle(true))
  return { cancel: () => settle(false), finish: () => settle(true) }
}
