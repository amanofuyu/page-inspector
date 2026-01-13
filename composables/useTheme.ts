import { COLOR_MODE_KEY } from '@/constants/key'
import { sendMessage } from '@/libs/messaging'
import { useExtStorage } from './useExtStorage'

export type ColorMode = 'dark' | 'light' | 'auto'

export function getPrefersColorScheme() {
  if (window.matchMedia) {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
    else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light'
    }
  }

  return 'light'
}

function getColorModeIsDark(prefersColorScheme: 'dark' | 'light', colorMode: ColorMode) {
  return colorMode === 'dark' || (prefersColorScheme === 'dark' && colorMode === 'auto')
}

export function useIsDark() {
  const colorMode = useExtStorage(COLOR_MODE_KEY)
  return computed(() => getColorModeIsDark(getPrefersColorScheme(), colorMode.value))
}

/**
 * Credit to [@hooray](https://github.com/hooray)
 * @see https://github.com/vuejs/vitepress/pull/2347
 */
export function changeColorMode(event: MouseEvent, nextColorMode: ColorMode) {
  // @ts-expect-error experimental API
  const isAppearanceTransition = document.startViewTransition
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

  storage.setItem(COLOR_MODE_KEY, nextColorMode)

  const isDark = getColorModeIsDark(getPrefersColorScheme(), nextColorMode)

  if (!isAppearanceTransition) {
    sendMessage('toggleDark', isDark)
    return
  }

  const x = event.clientX
  const y = event.clientY
  const endRadius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y),
  )

  const transition = document.startViewTransition(async () => {
    await sendMessage('toggleDark', isDark)
  })
  transition.ready
    .then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ]
      const animation = document.documentElement.animate(
        {
          clipPath: isDark
            ? [...clipPath].reverse()
            : clipPath,
        },
        {
          duration: 400,
          easing: 'ease-out',
          pseudoElement: isDark
            ? '::view-transition-old(root)'
            : '::view-transition-new(root)',
        },
      )

      animation.finished.then(() => {
        transition.skipTransition()
      })
    })
}
