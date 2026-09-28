import { usePreferredDark } from '@vueuse/core'
import { computed, watch } from 'vue'
import { COLOR_MODE_KEY } from '@/constants/key'
import { useExtStorage } from './useExtStorage'

export type ColorMode = 'dark' | 'light' | 'auto'
export function useTheme() {
  const colorMode = useExtStorage<ColorMode>(COLOR_MODE_KEY, 'auto')
  const prefersDark = usePreferredDark()
  const isDark = computed(() => colorMode.value === 'dark' || (colorMode.value !== 'light' && prefersDark.value))
  watch(isDark, value => document.documentElement.setAttribute('data-theme', value ? 'dark' : 'light'), { immediate: true })
  return { colorMode, isDark }
}
