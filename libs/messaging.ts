import { defineExtensionMessaging } from '@webext-core/messaging'

export interface CrawlResult {
  ssrData: Record<string, any> | null
}

export interface ProtocolMap {
  crawl: (url?: string) => CrawlResult | null
  openSidePanel: () => void
  toggleDark: (isDark: boolean) => void
  colorModeChanged: (isDark: boolean) => void
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>()
