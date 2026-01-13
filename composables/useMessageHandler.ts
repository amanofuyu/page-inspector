import { onMessage } from '@/libs/messaging'

export function useColorModeMessageHandler() {
  const offColorModeChanged = onMessage('colorModeChanged', async (message) => {
    const isDark = message.data

    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  })

  onUnmounted(() => {
    offColorModeChanged()
  })
}
