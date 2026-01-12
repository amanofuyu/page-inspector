import { defineExtensionMessaging } from '@webext-core/messaging'

export interface CrawlResult {
  [key: string]: any
}

export interface ProtocolMap {
  crawl: (url?: string) => CrawlResult | null
  openSidePanel: () => void
  toggleDark: (isDark: boolean) => void
  colorModeChanged: (isDark: boolean) => void
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>()
