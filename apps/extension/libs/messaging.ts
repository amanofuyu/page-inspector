import type { CrawlRequest, CrawlResponse } from '@/features/nuxt/types'
import type { SeoIdentity, SeoSnapshot } from '@/features/seo/model'
import type { Definition } from '@/features/watch/model'
import { defineExtensionMessaging } from '@webext-core/messaging'

export interface ProtocolMap {
  seoBaseline: (request: { action: 'get', identity: SeoIdentity } | { action: 'put', snapshot: SeoSnapshot }) => SeoSnapshot | null
  definition: (request: { action: 'save', definition: Definition } | { action: 'delete', id: string }) => void
  crawl: (request: CrawlRequest) => CrawlResponse
  cancelCrawl: (request: { clientId: string, requestId: string }) => void
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>()
