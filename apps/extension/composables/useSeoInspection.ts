import type { NetworkSession } from '@/features/network/session'
import type { SeoIdentity, SeoSnapshot } from '@/features/seo/model'
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { collectSeoDom } from '@/features/seo/collect-dom'
import { parseHtmlWorker } from '@/features/seo/html-worker'
import { sameSeoIdentity, SEO_LIMITS } from '@/features/seo/model'
import { buildSeoSnapshot } from '@/features/seo/normalize'
import { readNavigationHtml, readReferenceHtml } from '@/features/seo/sources'
import { sendMessage } from '@/libs/messaging'

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
  let reloadTimeout: ReturnType<typeof setTimeout> | undefined
  let captureAfterReload = false
  let disposed = false
  function cancel() {
    generation++
    controller?.abort()
    clearTimeout(scheduled)
    status.value = dom.value ? 'ready' : 'idle'
  }
  function stop() {
    cancel()
    clearTimeout(reloadTimeout)
    captureAfterReload = false
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
    if (
      result[0]?.result?.url !== identity.url
      || result[0]?.result?.start !== identity.navigationStart
    ) {
      throw new Error('页面已变化，请重新读取 SEO 数据。')
    }
  }
  async function refresh(kind: 'dom' | 'navigation' | 'reference' = 'dom') {
    const target = options.tabId()
    if (target === null || disposed)
      return
    stop()
    const ticket = generation
    const abort = new AbortController()
    controller = abort
    status.value = 'loading'
    error.value = ''
    sourceNotice.value = ''
    const current = () =>
      generation === ticket && !disposed && options.tabId() === target
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
    const started = Date.now()
    try {
      const tab = await browser.tabs.get(target)
      if (!tab.url || !/^https?:\/\//.test(tab.url))
        throw new Error('请在 HTTP 或 HTTPS 页面检查 SEO。')
      const results = await browser.scripting.executeScript({
        target: { tabId: target },
        func: collectSeoDom,
        args: [SEO_LIMITS],
      })
      const result = results.find(item => item.frameId === 0)
      const raw = result?.result
      if (!raw || !result.documentId)
        throw new Error('没有取得主文档的 SEO 数据。')
      const identity: SeoIdentity = {
        tabId: target,
        documentId: result.documentId,
        url: raw.url,
        initialUrl: raw.initialUrl,
        navigationStart: raw.navigationStart,
      }
      if (!current())
        return
      let baseline
        = html.value && sameSeoIdentity(html.value.identity, identity)
          ? html.value
          : null
      const snapshot = buildSeoSnapshot(raw, {
        source: 'live-dom',
        association: 'matched',
        identity,
      })
      await assertCurrent(identity)
      if (!current())
        return
      dom.value = snapshot
      html.value = baseline
      const network = options.network()
      if (kind === 'reference') {
        baseline = await parseHtmlWorker(
          await readReferenceHtml(identity, abort.signal),
          abort.signal,
        )
        if (!current())
          return
        sourceNotice.value
          = '这是本次重新请求的参考 HTML，不能据此确认客户端新增或删除；登录态和缓存可能与当前文档不同。'
      }
      else if (network && (kind === 'navigation' || !baseline)) {
        try {
          baseline = await parseHtmlWorker(
            await readNavigationHtml(network, identity, raw.frames),
            abort.signal,
          )
        }
        catch (failure) {
          if (kind === 'navigation')
            throw failure
          if (current()) {
            sourceNotice.value
              = failure instanceof Error ? failure.message : String(failure)
          }
        }
      }
      else if (!baseline) {
        baseline = await sendMessage('seoBaseline', {
          action: 'get',
          identity,
        }).catch(() => null)
      }
      await assertCurrent(identity)
      if (!current())
        return
      if (abort.signal.aborted)
        throw new Error('SEO 读取已取消或超时。')
      html.value = baseline
      if (network && baseline?.source === 'navigation-response') {
        void sendMessage('seoBaseline', {
          action: 'put',
          snapshot: baseline,
        }).catch(() => {})
      }
      await new Promise<void>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined
        const finish = () => {
          clearTimeout(timer)
          abort.signal.removeEventListener('abort', finish)
          resolve()
        }
        timer = setTimeout(
          finish,
          Math.max(0, 400 - (Date.now() - started)),
        )
        if (abort.signal.aborted)
          finish()
        else abort.signal.addEventListener('abort', finish, { once: true })
      })
      if (current())
        status.value = 'ready'
    }
    catch (failure) {
      if (current()) {
        error.value = abort.signal.aborted
          ? 'SEO 读取超时，请重试。'
          : failure instanceof Error
            ? failure.message
            : String(failure)
        status.value = 'error'
      }
    }
    finally {
      clearDeadline()
      abort.signal.removeEventListener('abort', clearDeadline)
    }
  }
  async function reloadAndCapture() {
    const target = options.tabId()
    if (target === null)
      return
    stop()
    reset()
    captureAfterReload = true
    status.value = 'loading'
    reloadTimeout = setTimeout(() => {
      stop()
      error.value = '等待页面加载超时，可在加载完成后重新读取。'
      status.value = 'error'
    }, 20000)
    try {
      await browser.tabs.reload(target)
    }
    catch (failure) {
      if (disposed || options.tabId() !== target || !captureAfterReload)
        return
      stop()
      error.value = String(failure)
      status.value = 'error'
    }
  }
  function onUpdated(tabId: number, change: { status?: string, url?: string }) {
    if (tabId !== options.tabId())
      return
    if (change.status === 'loading' || change.url) {
      reset()
      if (captureAfterReload)
        status.value = 'loading'
    }
    if (
      options.active()
      && (change.status === 'complete'
        || (change.url && change.status !== 'loading'))
    ) {
      clearTimeout(scheduled)
      scheduled = setTimeout(() => {
        const kind = captureAfterReload ? 'navigation' : 'dom'
        captureAfterReload = false
        clearTimeout(reloadTimeout)
        void refresh(kind)
      }, 400)
    }
  }
  browser.tabs.onUpdated.addListener(onUpdated)
  watch(
    () => [options.tabId(), options.active()] as const,
    ([target, active], previous) => {
      if (target !== previous?.[0]) {
        stop()
        reset()
      }
      if (active && target !== null)
        void refresh()
      else stop()
    },
    { immediate: true },
  )
  onBeforeUnmount(() => {
    disposed = true
    stop()
    browser.tabs.onUpdated.removeListener(onUpdated)
  })
  return {
    dom,
    html,
    status,
    error,
    sourceNotice,
    refresh,
    reloadAndCapture,
    cancel: stop,
  }
}
