import type { CrawlRequest, CrawlResponse } from '@/features/nuxt/types'
import { defineExtensionMessaging } from '@webext-core/messaging'

export interface ProtocolMap {
  crawl: (request: CrawlRequest) => CrawlResponse
  cancelCrawl: (request: { clientId: string, requestId: string }) => void
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>()
