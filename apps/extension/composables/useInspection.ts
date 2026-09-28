import type { CrawlResponse } from '@/features/nuxt/types'
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { createRequestGate } from '@/features/inspector/request-gate'
import { sendMessage } from '@/libs/messaging'

export function useInspection(target?: { tabId: number }) {
  const result = shallowRef<CrawlResponse | null>(null)
  const status = ref<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const message = ref('')
  const currentUrl = ref('')
  const tabId = ref<number | null>(null)
  const gate = createRequestGate()
  const clientId = crypto.randomUUID()
  let windowId: number | undefined
  let requestId: string | null = null
  let scheduled: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  function cancel() {
    gate.invalidate()
    clearTimeout(scheduled)
    if (requestId) {
      void sendMessage('cancelCrawl', { clientId, requestId }).catch(() => { })
      requestId = null
    }
  }
  async function refresh(retry = 0) {
    cancel()
    const ticket = gate.invalidate()
    status.value = 'loading'
    message.value = ''
    result.value = null
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      if (!target && windowId === undefined)
        throw new Error('尚未取得侧边栏所在窗口。')
      const tab = target ? await browser.tabs.get(target.tabId) : (await browser.tabs.query({ active: true, windowId }))[0]
      if (!gate.current(ticket) || disposed)
        return
      tabId.value = tab?.id ?? null
      currentUrl.value = tab?.url ?? ''
      if (tab?.id === undefined)
        throw new Error('当前窗口没有可读取的标签页。')
      const id = crypto.randomUUID()
      requestId = id
      const response = await Promise.race([
        sendMessage('crawl', { tabId: tab.id, requestId: id, clientId }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('读取超时，请重试。')), 20000)
        }),
      ])
      if (!gate.accepts(ticket, tab.id, id, response) || disposed)
        return
      requestId = null
      if (response.status === 'stale') {
        if (retry < 1) {
          scheduled = setTimeout(() => void refresh(retry + 1), 300)
          return
        }
        throw new Error(response.message || '页面已变化，请重试。')
      }
      if (response.status === 'error')
        throw new Error(response.message || '读取失败。')
      result.value = response
      currentUrl.value = response.snapshot?.pageUrl ?? currentUrl.value
      status.value = response.status
      if (response.status === 'empty' && tab.status === 'loading' && retry < 1) {
        scheduled = setTimeout(() => {
          if (gate.current(ticket))
            void refresh(retry + 1)
        }, 500)
      }
    }
    catch (error) {
      if (!gate.current(ticket) || disposed)
        return
      if (requestId)
        void sendMessage('cancelCrawl', { clientId, requestId }).catch(() => { })
      requestId = null
      status.value = 'error'
      message.value = error instanceof Error ? error.message : String(error)
    }
    finally {
      clearTimeout(timeout)
    }
  }
  function scheduleRefresh() {
    cancel()
    result.value = null
    status.value = 'loading'
    scheduled = setTimeout(() => void refresh(), 150)
  }
  function onActivated(info: {
    tabId: number
    windowId: number
  }) {
    if (target || info.windowId !== windowId)
      return
    tabId.value = info.tabId
    currentUrl.value = ''
    scheduleRefresh()
  }
  function onUpdated(id: number, change: {
    status?: string
    url?: string
  }) {
    if (id !== tabId.value)
      return
    if (change.url)
      currentUrl.value = change.url
    if (change.status === 'loading' || change.status === 'complete')
      scheduleRefresh()
    else if (change.url && status.value === 'loading')
      scheduleRefresh()
  }
  function onRemoved(id: number) {
    if (id === tabId.value) {
      tabId.value = null
      scheduleRefresh()
    }
  }
  const snapshotWarning = computed(() => {
    const snapshot = result.value?.snapshot
    if (!snapshot)
      return ''
    if (!snapshot.initialUrl)
      return '无法确认初始文档地址；此处展示采集到的内嵌快照。'
    if (snapshot.initialUrl !== currentUrl.value)
      return '页面地址已变化。此处为初始文档快照，不代表当前路由的运行时状态。'
    return ''
  })
  onMounted(async () => {
    browser.tabs.onActivated.addListener(onActivated)
    browser.tabs.onUpdated.addListener(onUpdated)
    browser.tabs.onRemoved.addListener(onRemoved)
    try {
      if (!target)
        windowId = (await browser.windows.getCurrent()).id
      if (!disposed)
        await refresh()
    }
    catch (error) {
      if (!disposed) {
        status.value = 'error'
        message.value = String(error)
      }
    }
  })
  onUnmounted(() => {
    disposed = true
    cancel()
    browser.tabs.onActivated.removeListener(onActivated)
    browser.tabs.onUpdated.removeListener(onUpdated)
    browser.tabs.onRemoved.removeListener(onRemoved)
  })
  return { result, status, message, tabId, currentUrl, snapshotWarning, refresh: () => refresh() }
}
