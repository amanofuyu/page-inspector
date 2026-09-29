import type { DefaultTreeAdapterTypes } from 'parse5'
import type { SeoHtmlInput, SeoRaw } from './model'
import { parse } from 'parse5'
import { SEO_LIMITS } from './model'
import { buildSeoSnapshot } from './normalize'

export function parseSeoHtml(input: SeoHtmlInput) {
  if (new TextEncoder().encode(input.text).byteLength > SEO_LIMITS.htmlBytes)
    throw new Error('HTML 超过 5 MiB 解析预算。')
  const document = parse(input.text, { scriptingEnabled: true })
  const raw: SeoRaw = {
    url: input.url,
    initialUrl: input.identity.initialUrl,
    navigationStart: input.identity.navigationStart,
    sampledAt: input.sampledAt,
    complete: true,
    reasons: [],
    nodes: [],
    frames: 0,
  }
  const pending: { node: DefaultTreeAdapterTypes.Node, head: boolean }[] = [
    { node: document, head: false },
  ]
  let scanned = 0
  let bytes = 0
  let metadata = 0
  let headings = 0
  const allowed = new Set([
    'name',
    'property',
    'content',
    'http-equiv',
    'charset',
    'rel',
    'href',
    'hreflang',
    'lang',
    'id',
    'type',
  ])
  while (pending.length) {
    const { node, head } = pending.pop()!
    if (++scanned > SEO_LIMITS.nodes) {
      raw.complete = false
      raw.reasons.push('HTML 节点达到解析预算。')
      break
    }
    const element = 'tagName' in node ? node : null
    const tag = element?.tagName ?? ''
    const inHead = head || tag === 'head'
    if (element && element.namespaceURI === 'http://www.w3.org/1999/xhtml') {
      const attrs = Object.fromEntries(
        element.attrs
          .filter(attr => allowed.has(attr.name))
          .map(attr => [attr.name, attr.value]),
      )
      const heading = tag === 'h1'
      if (
        ['html', 'title', 'meta', 'link', 'base'].includes(tag)
        || heading
        || (tag === 'script'
          && attrs.type?.trim().toLowerCase() === 'application/ld+json')
      ) {
        if (
          (heading
            ? ++headings > SEO_LIMITS.headings
            : ++metadata > SEO_LIMITS.metadata)
          || raw.nodes.length >= SEO_LIMITS.records
        ) {
          raw.complete = false
          raw.reasons.push('HTML 标签数量达到预算。')
          break
        }
        let truncated = false
        for (const key of Object.keys(attrs)) {
          truncated ||= attrs[key]!.length > SEO_LIMITS.value
          attrs[key] = attrs[key]!.slice(0, SEO_LIMITS.value)
        }
        let text = ''
        if (heading || tag === 'title' || tag === 'script') {
          const children: DefaultTreeAdapterTypes.Node[] = [
            ...element.childNodes,
          ].reverse()
          const max = tag === 'script' ? SEO_LIMITS.json : SEO_LIMITS.value
          while (children.length) {
            const child = children.pop()!
            if ('value' in child)
              text += child.value
            else if ('childNodes' in child)
              children.push(...[...child.childNodes].reverse())
            if (text.length > max) {
              truncated = true
              text = text.slice(0, max)
              break
            }
          }
        }
        const entry = {
          tag,
          attrs,
          text,
          location:
            tag === 'html'
              ? ('html' as const)
              : inHead
                ? ('head' as const)
                : ('body' as const),
          truncated,
        }
        bytes += new TextEncoder().encode(JSON.stringify(entry)).byteLength
        if (bytes > SEO_LIMITS.textBytes) {
          raw.complete = false
          raw.reasons.push('HTML 标签文本达到 2 MiB 预算。')
          break
        }
        if (truncated) {
          raw.complete = false
          if (!raw.reasons.length)
            raw.reasons.push('部分 HTML 标签超出单项长度预算。')
        }
        raw.nodes.push(entry)
      }
    }
    if ('childNodes' in node && tag !== 'noscript') {
      for (let index = node.childNodes.length - 1; index >= 0; index--)
        pending.push({ node: node.childNodes[index]!, head: inHead })
    }
  }
  for (const header of input.headers) {
    raw.nodes.push({
      tag: 'header',
      attrs: { name: header.name.toLowerCase() },
      text: header.value,
      location: 'header',
      truncated: header.truncated,
    })
  }
  raw.nodes.push({
    tag: 'header',
    attrs: { name: 'status' },
    text: String(input.status),
    location: 'header',
  })
  return buildSeoSnapshot(raw, {
    identity: input.identity,
    source: input.source,
    association: input.association,
    status: input.status,
    headers: input.headers,
    requestId: input.requestId,
  })
}
