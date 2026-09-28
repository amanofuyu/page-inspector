import type { CrawlRequest, CrawlResponse, PageSnapshot } from '@/features/nuxt/types'
import { collectNuxtPayload } from '@/features/nuxt/collect'
import { readExternalPayload } from '@/features/nuxt/external'
import { MAX_APPLICATIONS, MAX_PAYLOAD_BYTES } from '@/features/nuxt/types'

const pending = new Map<string, {
  tabId: number
  requestId: string
  controller: AbortController
}>()
export function cancelCrawl(clientId: string, requestId?: string) {
  const request = pending.get(clientId)
  if (request && (!requestId || request.requestId === requestId)) {
    request.controller.abort()
    pending.delete(clientId)
  }
}
export function cancelTabCrawls(tabId: number) {
  for (const [clientId, request] of pending) {
    if (request.tabId === tabId)
      cancelCrawl(clientId)
  }
}
export async function handleCrawl(request: CrawlRequest): Promise<CrawlResponse> {
  const response: CrawlResponse = { tabId: request.tabId, requestId: request.requestId, documentId: null, status: 'error', snapshot: null }
  if (!Number.isInteger(request.tabId) || request.tabId < 0 || !request.clientId || !request.requestId)
    return { ...response, message: '采集请求无效。' }
  cancelCrawl(request.clientId)
  const controller = new AbortController()
  pending.set(request.clientId, { ...request, controller })
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const tab = await browser.tabs.get(request.tabId)
    if (!tab.url || !/^https?:\/\//.test(tab.url))
      return { ...response, message: '此页面不支持读取，请打开 HTTP 或 HTTPS 网站。' }
    const results = await browser.scripting.executeScript({
      target: { tabId: request.tabId },
      func: collectNuxtPayload,
      args: [MAX_PAYLOAD_BYTES, MAX_APPLICATIONS],
    })
    const result = results.find(item => item.frameId === 0)
    const snapshot = result?.result as PageSnapshot | undefined
    if (!snapshot)
      return { ...response, message: '页面未返回采集结果。' }
    response.documentId = result?.documentId ?? null
    let remaining = MAX_PAYLOAD_BYTES - snapshot.apps.reduce((sum, app) => sum + app.sources.reduce((total, source) => total + (source.text === null ? 0 : (source.messageBytes ?? source.bytes)), 0), 0)
    for (const app of snapshot.apps) {
      if (controller.signal.aborted)
        break
      if (app.externalUrl) {
        const source = await readExternalPayload(app.externalUrl, snapshot.pageUrl, Math.max(0, remaining), controller.signal)
        app.sources.push(source)
        if (source.text !== null)
          remaining -= source.messageBytes ?? source.bytes
      }
    }
    // 外部请求期间可能导航，必须再次验证原文档身份。
    const identity = await browser.scripting.executeScript({
      target: response.documentId ? { tabId: request.tabId, documentIds: [response.documentId] } : { tabId: request.tabId },
      func: () => ({ url: location.href, initialUrl: performance.getEntriesByType('navigation')[0]?.name || null }),
    })
    const current = identity[0]?.result
    if (pending.get(request.clientId)?.controller !== controller || !current || current.url !== snapshot.pageUrl || current.initialUrl !== snapshot.initialUrl)
      return { ...response, status: 'stale', message: '页面已变化，请重新读取。' }
    snapshot.snapshotId = `${response.documentId ?? 'unknown'}:${request.requestId}`
    snapshot.apps.forEach((app, appIndex) => app.sources.forEach((source, index) => {
      source.snapshotId = snapshot.snapshotId
      source.documentId = response.documentId
      source.sourceId = `${snapshot.snapshotId}:${appIndex}:${index}`
    }))
    if (controller.signal.aborted)
      snapshot.warnings.push('采集超时，已保留取得的数据；可重试未完成的外部来源。')
    return { ...response, snapshot, status: snapshot.apps.length ? 'ready' : 'empty' }
  }
  catch (error) {
    return { ...response, status: controller.signal.aborted ? 'stale' : 'error', message: controller.signal.aborted ? '采集已取消或超时。' : `无法读取页面：${error instanceof Error ? error.message : String(error)}` }
  }
  finally {
    clearTimeout(timeout)
    if (pending.get(request.clientId)?.controller === controller)
      pending.delete(request.clientId)
  }
}
