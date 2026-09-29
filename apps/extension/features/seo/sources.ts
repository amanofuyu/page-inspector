import type { NetworkSession } from '../network/session'
import type { SeoHtmlInput, SeoIdentity } from './model'
import { SEO_LIMITS } from './model'

export function navigationCandidate(
  session: NetworkSession,
  identity: SeoIdentity,
  frames: number,
) {
  const withoutHash = (value: string) => value.split('#')[0]
  if (
    !identity.initialUrl
    || withoutHash(identity.url) !== withoutHash(identity.initialUrl)
  ) {
    throw new Error(
      '当前为同文档路由，初始 HTML 不属于当前路由。请刷新页面并捕获，或读取参考 HTML。',
    )
  }
  if (frames) {
    throw new Error(
      '页面包含子框架，HAR 未提供可靠框架身份；暂不确认主文档来源，可读取参考 HTML。',
    )
  }
  session.setDocument(identity.documentId, identity.navigationStart)
  const candidates = session.records.filter(
    record =>
      record.resourceType.toLowerCase() === 'document'
      && withoutHash(record.url) === withoutHash(identity.url)
      && record.documentId === identity.documentId
      && record.pageStartedAt !== null
      && Math.abs(record.pageStartedAt - identity.navigationStart) <= 1,
  )
  if (candidates.length !== 1 || candidates[0]!.ambiguous) {
    throw new Error(
      '未取得可唯一关联的本次文档响应。请在 DevTools 中刷新页面并捕获 HTML。',
    )
  }
  const candidate = candidates[0]!
  if (
    candidate.status === null
    || candidate.status < 200
    || candidate.status >= 300
    || [204, 205, 206].includes(candidate.status)
    || candidate.redirectUrl
  ) {
    throw new Error(
      '当前响应不是完整的 HTML 文档响应，不能建立初始 HTML 基线。',
    )
  }
  if (!/^text\/html(?:;|$)/i.test(candidate.mime))
    throw new Error('文档响应不是支持的 HTML 类型。')
  if (
    candidate.contentSize === null
    || candidate.contentSize > SEO_LIMITS.htmlBytes
  ) {
    throw new Error('HTML 大小未知或超过 5 MiB 读取预算。')
  }
  return candidate
}
export async function readNavigationHtml(
  session: NetworkSession,
  identity: SeoIdentity,
  frames: number,
): Promise<SeoHtmlInput> {
  const record = navigationCandidate(session, identity, frames)
  const body = await session.read(record.id)
  if (body.bytes > SEO_LIMITS.htmlBytes)
    throw new Error('HTML 超过 5 MiB 解析预算。')
  return {
    text: body.text,
    url: record.url,
    identity,
    source: 'navigation-response',
    association: 'matched',
    sampledAt: Date.now(),
    status: record.status!,
    headers: session.seoHeaders(record.id),
    requestId: record.id,
  }
}
/** 参考读取不跟随重定向，避免把登录页或其他站点内容默认为当前文档。 */
export async function readReferenceHtml(
  identity: SeoIdentity,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<SeoHtmlInput> {
  const url = new URL(identity.url)
  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
  ) {
    throw new Error('参考 HTML 仅支持不含 URL 凭据的 HTTP(S) 页面。')
  }
  url.hash = ''
  const response = await fetcher(url.href, {
    signal,
    credentials: 'include',
    redirect: 'error',
    cache: 'no-cache',
  })
  const contentType = response.headers.get('content-type') ?? ''
  if (!/^text\/html(?:;|$)/i.test(contentType)) {
    await response.body?.cancel()
    throw new Error('响应不是 HTML，无法作为参考文档。')
  }
  if (
    !response.body
    || Number(response.headers.get('content-length')) > SEO_LIMITS.htmlBytes
  ) {
    await response.body?.cancel()
    throw new Error('响应没有正文或超过 5 MiB 预算。')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done)
        break
      length += next.value.length
      if (length > SEO_LIMITS.htmlBytes) {
        await reader.cancel()
        throw new Error('HTML 超过 5 MiB 读取预算。')
      }
      chunks.push(next.value)
    }
  }
  finally {
    reader.releaseLock()
  }
  const buffer = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.length
  }
  const prefix = new TextDecoder('windows-1252').decode(buffer.slice(0, 1024))
  const bom
    = buffer[0] === 239 && buffer[1] === 187 && buffer[2] === 191
      ? 'utf-8'
      : buffer[0] === 255 && buffer[1] === 254
        ? 'utf-16le'
        : buffer[0] === 254 && buffer[1] === 255
          ? 'utf-16be'
          : ''
  const charset
    = bom
      || /charset\s*=\s*["']?([^;\s"']+)/i.exec(contentType)?.[1]
      || /<meta\s[^>]*charset\s*=\s*["']?([^\s"'/>;]+)/i.exec(prefix)?.[1]
      || 'utf-8'
  const text = new TextDecoder(charset).decode(buffer)
  const headers = [...response.headers]
    .filter(([name]) => ['x-robots-tag', 'link', 'content-type'].includes(name))
    .map(([name, value]) => ({ name, value: value.slice(0, 16384), truncated: value.length > 16384 }))
  return {
    text,
    url: response.url || url.href,
    identity,
    source: 'refetch-reference',
    association: 'reference',
    sampledAt: Date.now(),
    status: response.status,
    headers,
  }
}
