import type { PageSnapshot, RawSource } from './types'
/** 此函数会被独立序列化注入页面，运行时依赖必须通过参数传入。 */
export function collectNuxtPayload(maxBytes: number, maxApps: number): PageSnapshot {
  const collectedAt = Date.now()
  const navigation = performance.getEntriesByType('navigation')[0]
  const nodes = document.querySelectorAll<HTMLScriptElement>('script#__NUXT_DATA__, script[data-nuxt-data]')
  const warnings: string[] = []
  let remaining = maxBytes
  const encoder = new TextEncoder()
  if (nodes.length > maxApps)
    warnings.push(`检测到 ${nodes.length} 个应用，仅采集前 ${maxApps} 个。`)
  const apps = Array.from(nodes).slice(0, maxApps).map((node, index) => {
    const text = node.textContent ?? ''
    // 按消息中的转义后大小计费，避免异常文本越过消息体积限制。
    const measured = text.length <= remaining
    const bytes = measured ? encoder.encode(JSON.stringify(text)).byteLength : text.length
    const allowed = bytes <= remaining
    if (allowed)
      remaining -= bytes
    const rawBytes = allowed ? encoder.encode(text).byteLength : null
    const sources: RawSource[] = [{
      kind: 'inline',
      url: location.href,
      text: allowed ? text : null,
      bytes: rawBytes ?? 0,
      rawUtf8Bytes: rawBytes,
      messageBytes: measured ? bytes : null,
      readBytesLowerBound: rawBytes ?? text.length,
      complete: allowed,
      transport: 'dom',
      fetchedAt: collectedAt,
      ...(!allowed ? { error: '内嵌数据超过采集体积上限，未读取原文。' } : {}),
    }]
    let externalUrl: string | null = null
    if (node.dataset.src) {
      try {
        externalUrl = new URL(node.dataset.src, document.baseURI).href
      }
      catch { sources.push({ kind: 'external', url: node.dataset.src, text: null, bytes: 0, fetchedAt: collectedAt, error: '外部数据地址格式无效。' }) }
    }
    return {
      id: `${node.dataset.nuxtData || node.id || 'nuxt'}:${index}`,
      label: node.dataset.nuxtData || node.id || `Nuxt 应用 ${index + 1}`,
      declaredId: node.dataset.nuxtData || node.id || null,
      serverRendered: node.dataset.ssr === 'true' ? true : node.dataset.ssr === 'false' ? false : null,
      externalUrl,
      sources,
    }
  })
  return {
    pageUrl: location.href,
    initialUrl: navigation?.name || null,
    title: document.title,
    collectedAt,
    navigationStartedAt: performance.timeOrigin,
    apps,
    warnings,
  }
}
