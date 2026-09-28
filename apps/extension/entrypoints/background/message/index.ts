import { mutateDefinition } from '@/features/watch/storage'
import { onMessage } from '@/libs/messaging'
import { cancelCrawl, cancelTabCrawls, handleCrawl } from './crawl'

export function setupMessage() {
  onMessage('definition', message => mutateDefinition(message.data))
  onMessage('crawl', message => handleCrawl(message.data))
  onMessage('cancelCrawl', message => cancelCrawl(message.data.clientId, message.data.requestId))
  browser.tabs.onRemoved.addListener(cancelTabCrawls)
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'loading')
      cancelTabCrawls(tabId)
  })
}
