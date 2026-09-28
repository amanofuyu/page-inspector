import type { RawSource } from './types'
/** 流式读取并限制体积，避免先将任意大小的响应装入内存。 */
export async function readExternalPayload(url: string, pageUrl: string, maxBytes: number, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<RawSource> {
  const source: RawSource = { kind: 'external', url, text: null, bytes: 0, rawUtf8Bytes: null, messageBytes: null, readBytesLowerBound: 0, complete: false, transport: 'extension-fetch', fetchedAt: Date.now() }
  try {
    const target = new URL(url, pageUrl)
    if (!['http:', 'https:'].includes(target.protocol))
      throw new Error('外部 payload 仅支持 HTTP 或 HTTPS。')
    const response = await fetcher(target.href, {
      signal,
      credentials: target.origin === new URL(pageUrl).origin ? 'include' : 'omit',
      redirect: 'error',
      cache: 'no-cache',
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`读取失败（HTTP ${response.status}）。`)
    }
    if (response.headers.get('content-type')?.includes('text/html')) {
      await response.body?.cancel()
      throw new Error('返回了 HTML 页面，可能需要登录。')
    }
    if (!response.body)
      throw new Error('外部响应没有可读取的内容。')
    if (Number(response.headers.get('content-length')) > maxBytes) {
      await response.body.cancel()
      throw new Error('外部数据超过剩余采集体积上限。')
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done)
          break
        source.readBytesLowerBound! += chunk.value.byteLength
        if (source.readBytesLowerBound! > maxBytes) {
          await reader.cancel()
          throw new Error('外部数据超过剩余采集体积上限。')
        }
        text += decoder.decode(chunk.value, { stream: true })
      }
      text += decoder.decode()
    }
    finally {
      reader.releaseLock()
    }
    source.messageBytes = new TextEncoder().encode(JSON.stringify(text)).byteLength
    if (source.messageBytes > maxBytes)
      throw new Error('外部数据在消息中超过剩余体积上限。')
    source.bytes = new TextEncoder().encode(text).byteLength
    source.rawUtf8Bytes = source.bytes
    source.complete = true
    source.text = text
    source.fetchedAt = Date.now()
  }
  catch (error) {
    source.error = signal.aborted ? '外部数据读取已取消或超时。' : error instanceof Error ? error.message : String(error)
  }
  return source
}
