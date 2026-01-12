import { onMessage, sendMessage } from '@/libs/messaging'
import { safe } from '@/utils/safe'
import { handleCrawl } from './crawl'

export function setupMessage() {
  onMessage('crawl', (message) => {
    return handleCrawl(message.data)
  })

  onMessage('openSidePanel', async (message) => {
    return browser.sidePanel.open({ tabId: message.sender.tab?.id })
  })

  onMessage('toggleDark', async (message) => {
    const isDark = message.data

    const tabs = await browser.tabs.query({})

    await safe(Promise.allSettled([
      sendMessage('colorModeChanged', isDark), // notify sidepanel
      ...tabs.map(tab => tab.id && sendMessage('colorModeChanged', isDark, { tabId: tab.id })), // notify all tabs
    ]))
  })
}
