import type { SeoHeader, SeoSnapshot } from './model'
import { parseHtmlWorker } from './html-worker'
import { SEO_LIMITS } from './model'
import { resolveSeoUrl, safeSeoUrl } from './page-data'

export interface SeoHeaderSample { url: string, status: number, sampledAt: number, headers: SeoHeader[] }
export interface SeoReferenceResult { url: string, status: number, backReference: boolean | null, sampledAt: number }

/** 手动请求使用扩展已有的主机权限；不携带登录凭据，不回填文档响应快照。 */
export async function requestSeoHeaders(url: string, signal: AbortSignal): Promise<SeoHeaderSample> {
  const target = safeSeoUrl(url)
  if (!target)
    throw new Error('仅支持 HTTP(S) 地址。')
  const response = await fetch(target, { method: 'HEAD', credentials: 'omit', signal })
  if (response.status === 405 || response.status === 501)
    throw new Error('服务器不支持 HEAD；可在 DevTools 中查看本次文档响应头。')
  const headers: SeoHeader[] = []
  for (const name of ['content-type', 'x-robots-tag', 'link']) {
    const value = response.headers.get(name)
    if (value !== null)
      headers.push({ name, value: value.slice(0, SEO_LIMITS.value), truncated: value.length > SEO_LIMITS.value })
  }
  return { url: response.url || target, status: response.status, sampledAt: Date.now(), headers }
}

/** 逐块限制实际解码体积，避免压缩响应或缺少 Content-Length 时绕过预算。 */
async function readReferenceBody(response: Response, signal: AbortSignal) {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > SEO_LIMITS.htmlBytes) {
    await response.body?.cancel()
    throw new Error('目标 HTML 超过 5 MiB 读取预算。')
  }
  if (!response.body)
    throw new Error('目标没有可读取的 HTML 正文。')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parts: string[] = []
  let bytes = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done)
        break
      bytes += value.byteLength
      if (bytes > SEO_LIMITS.htmlBytes)
        throw new Error('目标 HTML 超过 5 MiB 读取预算。')
      parts.push(decoder.decode(value, { stream: true }))
    }
    parts.push(decoder.decode())
    return parts.join('')
  }
  finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function requestHreflang(snapshot: SeoSnapshot, href: string, signal: AbortSignal): Promise<SeoReferenceResult> {
  const target = safeSeoUrl(href, snapshot.page?.baseUrl || snapshot.url)
  if (!target)
    throw new Error('hreflang 地址不是有效的 HTTP(S) 地址。')
  const response = await fetch(target, { credentials: 'omit', signal })
  const url = response.url || target
  if (!response.ok) {
    await response.body?.cancel()
    return { url, status: response.status, backReference: null, sampledAt: Date.now() }
  }
  if (!/^text\/html(?:;|$)/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel()
    throw new Error(`目标响应不是 HTML（HTTP ${response.status}）。`)
  }
  const text = await readReferenceBody(response, signal)
  const parsed = await parseHtmlWorker({ text, url, source: 'reference-response', identity: snapshot.identity, status: response.status, headers: [], sampledAt: Date.now() }, signal)
  const withoutHash = (value: string) => value.split('#')[0]
  const backReference = parsed.fields.some(field => field.group === 'languages' && withoutHash(resolveSeoUrl(field.value, parsed.page?.baseUrl || url)) === withoutHash(snapshot.url))
  return { url, status: response.status, sampledAt: Date.now(), backReference: backReference ? true : parsed.complete ? false : null }
}
