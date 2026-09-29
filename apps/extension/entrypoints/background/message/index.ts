import { SeoBaselines } from '@/features/seo/baselines'
import { mutateDefinition } from '@/features/watch/storage'
import { onMessage } from '@/libs/messaging'
import { cancelCrawl, cancelTabCrawls, handleCrawl } from './crawl'

export function setupMessage() {
  const seo = new SeoBaselines()
  onMessage('seoBaseline', async ({ data, sender }) => {
    const page = sender.url?.split('?')[0]
    if (sender.id !== browser.runtime.id || !['sidepanel.html', 'inspector-panel.html'].some(path => page === browser.runtime.getURL(`/${path}`)))
      throw new Error('SEO 基线仅向本扩展面板开放。')
    if (data.action === 'get')
      return seo.get(data.identity)
    if (page !== browser.runtime.getURL('/inspector-panel.html'))
      throw new Error('仅 DevTools 可以共享文档响应。')
    const identity = data.snapshot.identity
    const results = await browser.scripting.executeScript({ target: { tabId: identity.tabId, documentIds: [identity.documentId] }, func: () => ({ url: location.href, start: performance.timeOrigin }) })
    if (results[0]?.result?.url !== identity.url || results[0]?.result?.start !== identity.navigationStart)
      throw new Error('页面已变化，基线不再共享。')
    seo.put(data.snapshot)
    return null
  })
  browser.tabs.onRemoved.addListener(tabId => seo.clear(tabId))
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'loading' || change.url)
      seo.clear(tabId)
  })
  onMessage('definition', message => mutateDefinition(message.data))
  onMessage('crawl', message => handleCrawl(message.data))
  onMessage('cancelCrawl', message => cancelCrawl(message.data.clientId, message.data.requestId))
  browser.tabs.onRemoved.addListener(cancelTabCrawls)
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'loading')
      cancelTabCrawls(tabId)
  })
}
