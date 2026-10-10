import type { NetworkSession } from '@/features/network/session'
import type { SeoIdentity, SeoSnapshot } from '@/features/seo/model'
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { collectSeoDom } from '@/features/seo/collect-dom'
import { parseHtmlWorker } from '@/features/seo/html-worker'
import { sameSeoIdentity, SEO_LIMITS } from '@/features/seo/model'
import { buildSeoSnapshot } from '@/features/seo/normalize'
import { navigationCandidate, readNavigationHtml } from '@/features/seo/sources'

/** DOM 与 HTML 分别采样；正文仅在用户明确读取时取得，不建立比较基线。 */
export function useSeoInspection(options: {
  tabId: () => number | null
  active: () => boolean
  network: () => NetworkSession | undefined
}) {
  const dom = shallowRef<SeoSnapshot | null>(null)
  const html = shallowRef<SeoSnapshot | null>(null)
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const error = ref('')
  const sourceNotice = ref('')
  let generation = 0
  let controller: AbortController | undefined
  let scheduled: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  function cancel() {
    generation++
    controller?.abort()
    clearTimeout(scheduled)
    status.value = dom.value ? 'ready' : 'idle'
  }
  function reset() {
    cancel()
    dom.value = null
    html.value = null
    error.value = ''
    sourceNotice.value = ''
  }
  async function assertCurrent(identity: SeoIdentity) {
    const result = await browser.scripting.executeScript({
      target: { tabId: identity.tabId, documentIds: [identity.documentId] },
      func: () => ({ url: location.href, start: performance.timeOrigin }),
    })
    if (result[0]?.result?.url !== identity.url || result[0]?.result?.start !== identity.navigationStart)
      throw new Error('页面已变化，请重新读取 SEO 数据。')
  }
  async function refresh(kind: 'dom' | 'html' = 'dom') {
    const target = options.tabId()
    if (target === null || disposed)
      return
    cancel()
    const ticket = generation
    const abort = new AbortController()
    controller = abort
    const current = () => generation === ticket && !disposed && options.tabId() === target
    status.value = 'loading'
    error.value = ''
    sourceNotice.value = ''
    const timeout = setTimeout(() => {
      abort.abort()
      if (current()) {
        generation++
        error.value = 'SEO 读取超时，请重试。'
        status.value = 'error'
      }
    }, 20000)
    const clearDeadline = () => clearTimeout(timeout)
    abort.signal.addEventListener('abort', clearDeadline, { once: true })
    try {
      const tab = await browser.tabs.get(target)
      if (!tab.url || !/^https?:\/\//.test(tab.url))
        throw new Error('请在 HTTP 或 HTTPS 页面查看 SEO。')
      const results = await browser.scripting.executeScript({ target: { tabId: target }, func: collectSeoDom, args: [SEO_LIMITS] })
      const result = results.find(item => item.frameId === 0)
      const raw = result?.result
      if (!raw || !result.documentId)
        throw new Error('没有取得主文档的 SEO 数据。')
      const identity: SeoIdentity = { tabId: target, documentId: result.documentId, url: raw.url, initialUrl: raw.initialUrl, navigationStart: raw.navigationStart }
      await assertCurrent(identity)
      if (!current())
        return
      if (html.value && !sameSeoIdentity(html.value.identity, identity))
        html.value = null
      let response: Pick<SeoSnapshot, 'status' | 'headers' | 'requestId'> = {}
      const observed = options.network()
      if (observed?.records) {
        try {
          const record = navigationCandidate(observed, identity, raw.frames)
          const headers = observed.seoHeaders(record.id)
          response = { status: record.status!, headers, requestId: record.id }
          for (const header of headers)
            raw.nodes.push({ tag: 'header', attrs: { name: header.name }, text: header.value, location: 'header', truncated: header.truncated })
        }
        catch {
          // 无可靠关联时保持未读取，不将重新请求的响应头当作原文档响应。
        }
      }
      dom.value = buildSeoSnapshot(raw, { source: 'live-dom', identity, ...response })
      if (kind === 'html') {
        const network = options.network()
        if (!network)
          throw new Error('HTML 正文仅可在 DevTools 中读取。')
        const input = await readNavigationHtml(network, identity, raw.frames)
        if (!current())
          return
        const snapshot = await parseHtmlWorker(input, abort.signal)
        await assertCurrent(identity)
        if (!current())
          return
        html.value = snapshot
      }
      if (current())
        status.value = 'ready'
    }
    catch (failure) {
      if (current()) {
        error.value = abort.signal.aborted ? 'SEO 读取超时，请重试。' : failure instanceof Error ? failure.message : String(failure)
        status.value = 'error'
      }
    }
    finally {
      clearDeadline()
      abort.signal.removeEventListener('abort', clearDeadline)
    }
  }
  function onUpdated(tabId: number, change: { status?: string, url?: string }) {
    if (tabId !== options.tabId())
      return
    if (change.status === 'loading' || change.url)
      reset()
    if (options.active() && (change.status === 'complete' || (change.url && change.status !== 'loading'))) {
      clearTimeout(scheduled)
      scheduled = setTimeout(() => void refresh(), 150)
    }
  }
  browser.tabs.onUpdated.addListener(onUpdated)
  watch(() => [options.tabId(), options.active()] as const, ([target, active], previous) => {
    if (target !== previous?.[0])
      reset()
    if (active && target !== null)
      void refresh()
    else cancel()
  }, { immediate: true })
  onBeforeUnmount(() => {
    disposed = true
    cancel()
    browser.tabs.onUpdated.removeListener(onUpdated)
  })
  return { dom, html, status, error, sourceNotice, refresh, cancel }
}
