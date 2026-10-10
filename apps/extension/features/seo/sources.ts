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
      '当前为同文档路由，初始 HTML 不属于当前路由。请刷新页面后读取 HTML。',
    )
  }
  if (frames) {
    throw new Error(
      '页面包含子框架，HAR 未提供可靠框架身份；暂时无法读取可确认的主文档 HTML。',
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
      '未取得可唯一关联的本次文档响应。请在 DevTools 中刷新页面后读取 HTML。',
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
      '当前响应不是完整的 HTML 文档响应，无法读取初始 HTML。',
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
    sampledAt: Date.now(),
    status: record.status!,
    headers: session.seoHeaders(record.id),
    requestId: record.id,
  }
}
