import type { DefaultTreeAdapterTypes } from 'parse5'
import type { SeoHtmlInput, SeoRaw } from './model'
import { parse } from 'parse5'
import { SEO_LIMITS } from './model'
import { buildSeoSnapshot } from './normalize'

export function parseSeoHtml(input: SeoHtmlInput) {
  const encoder = new TextEncoder()
  if (encoder.encode(input.text).byteLength > SEO_LIMITS.htmlBytes)
    throw new Error('HTML 超过 5 MiB 解析预算。')
  const document = parse(input.text, { scriptingEnabled: true })
  const raw: SeoRaw = { url: input.url, initialUrl: input.identity.initialUrl, navigationStart: input.identity.navigationStart, sampledAt: input.sampledAt, complete: true, reasons: [], nodes: [], microdata: [], frames: 0 }
  const fail = (reason: string) => {
    raw.complete = false
    if (!raw.reasons.includes(reason))
      raw.reasons.push(reason)
  }
  const references = new Set<string>()
  const referenceNodes: DefaultTreeAdapterTypes.Node[] = [document]
  let referenceScanned = 0
  while (referenceNodes.length && ++referenceScanned <= SEO_LIMITS.nodes) {
    const node = referenceNodes.pop()!
    if ('tagName' in node) {
      if (['noscript', 'template'].includes(node.tagName))
        continue
      if (node.attrs.some(attr => attr.name === 'itemscope')) {
        for (const id of (node.attrs.find(attr => attr.name === 'itemref')?.value ?? '').split(/\s+/))
          references.add(id)
      }
    }
    if ('childNodes' in node)
      referenceNodes.push(...[...node.childNodes].reverse())
  }
  if (referenceNodes.length)
    fail('Microdata 引用扫描达到节点预算。')
  const text: string[] = []
  let textLength = 0
  function addText(value: string) {
    const left = SEO_LIMITS.bodyText - textLength
    if (value.length > left)
      fail('正文文本超过计数预算，字数仅覆盖已读取部分。')
    if (left > 0) {
      text.push(value.slice(0, left))
      textLength += Math.min(value.length, left)
    }
  }
  const pending: { node: DefaultTreeAdapterTypes.Node | null, head: boolean, body: boolean, skipWords: boolean, parent: number | null }[] = [{ node: document, head: false, body: false, skipWords: false, parent: null }]
  const allowed = new Set(['name', 'property', 'content', 'http-equiv', 'charset', 'rel', 'href', 'hreflang', 'lang', 'id', 'type', 'src', 'alt', 'title', 'width', 'height', 'itemscope', 'itemtype', 'itemprop', 'itemref', 'itemid', 'value', 'datetime', 'data'])
  const blocks = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'td', 'th', 'tr', 'ul'])
  let scanned = 0
  let bytes = encoder.encode(JSON.stringify(raw)).byteLength + 2048
  let metadata = 0
  let headings = 0
  while (pending.length) {
    if (++scanned > SEO_LIMITS.nodes) {
      fail('HTML 节点达到解析预算。')
      break
    }
    const { node, head, body, skipWords, parent } = pending.pop()!
    if (!node) {
      addText(' ')
      continue
    }
    if ('value' in node) {
      if (body && !skipWords)
        addText(node.value)
      continue
    }
    const element = 'tagName' in node ? node : null
    if (element && element.namespaceURI !== 'http://www.w3.org/1999/xhtml')
      continue
    const tag = element?.tagName ?? ''
    if (['noscript', 'template'].includes(tag))
      continue
    const inHead = head || tag === 'head'
    const inBody = body || tag === 'body'
    let microParent = parent
    const allAttrs = element ? Object.fromEntries(element.attrs.map(attr => [attr.name, attr.value])) : {}
    const excludedWords = skipWords || ['script', 'style'].includes(tag) || allAttrs.hidden !== undefined
    const block = inBody && !excludedWords && blocks.has(tag)
    if (block)
      addText(' ')
    if (element && element.namespaceURI === 'http://www.w3.org/1999/xhtml') {
      const attrs = Object.fromEntries(Object.entries(allAttrs).filter(([key]) => allowed.has(key)))
      const heading = /^h[1-6]$/.test(tag)
      const selected = ['html', 'title', 'meta', 'link', 'base', 'a', 'img'].includes(tag) || heading || (tag === 'script' && attrs.type?.trim().toLowerCase() === 'application/ld+json')
      const micro = attrs.itemscope !== undefined || attrs.itemprop !== undefined || (attrs.id !== undefined && references.has(attrs.id))
      if (selected || micro) {
        let truncated = false
        for (const key of Object.keys(attrs)) {
          truncated ||= attrs[key]!.length > SEO_LIMITS.value
          attrs[key] = attrs[key]!.slice(0, SEO_LIMITS.value)
        }
        let value = ''
        if (heading || tag === 'title' || tag === 'script' || tag === 'a' || (attrs.itemprop !== undefined && attrs.itemscope === undefined)) {
          const children: DefaultTreeAdapterTypes.Node[] = [...element.childNodes].reverse()
          const max = tag === 'script' ? SEO_LIMITS.json : SEO_LIMITS.value
          let visited = 0
          while (children.length) {
            const child = children.pop()!
            if ('value' in child)
              value += child.value
            else if ('childNodes' in child)
              children.push(...[...child.childNodes].reverse())
            if (value.length > max || ++visited > SEO_LIMITS.nodes) {
              value = value.slice(0, max)
              truncated = true
              break
            }
          }
        }
        const entry = { tag, attrs, text: value, location: tag === 'html' ? 'html' as const : inHead ? 'head' as const : 'body' as const, truncated }
        if (selected) {
          if ((heading ? ++headings > SEO_LIMITS.headings : !['a', 'img'].includes(tag) && ++metadata > SEO_LIMITS.metadata) || raw.nodes.length >= SEO_LIMITS.records) {
            fail('HTML 标签数量达到预算。')
            break
          }
          const size = encoder.encode(JSON.stringify(entry)).byteLength + 1
          if (bytes + size > SEO_LIMITS.textBytes) {
            fail('HTML 标签文本达到 2 MiB 预算。')
            break
          }
          bytes += size
          raw.nodes.push(entry)
        }
        if (micro) {
          if (raw.microdata!.length < SEO_LIMITS.microdata) {
            const record = { ...entry, parent }
            const size = encoder.encode(JSON.stringify(record)).byteLength + 1
            if (bytes + size > SEO_LIMITS.textBytes) {
              fail('HTML 标签文本达到 2 MiB 预算。')
              break
            }
            microParent = raw.microdata!.length
            raw.microdata!.push(record)
            bytes += size
          }
          else {
            fail('Microdata 节点数量达到读取预算。')
          }
        }
        if (truncated)
          fail('部分 HTML 标签超出单项长度预算。')
      }
    }
    if (block)
      pending.push({ node: null, head: inHead, body: inBody, skipWords: excludedWords, parent: microParent })
    if ('childNodes' in node && !['script', 'style'].includes(tag)) {
      for (let index = node.childNodes.length - 1; index >= 0; index--)
        pending.push({ node: node.childNodes[index]!, head: inHead, body: inBody, skipWords: excludedWords, parent: microParent })
    }
  }
  const content = text.join('').trim()
  raw.wordCount = content ? content.split(/\s+/u).length : 0
  for (const header of input.headers)
    raw.nodes.push({ tag: 'header', attrs: { name: header.name.toLowerCase() }, text: header.value, location: 'header', truncated: header.truncated })
  raw.nodes.push({ tag: 'header', attrs: { name: 'status' }, text: String(input.status), location: 'header' })
  return buildSeoSnapshot(raw, { identity: input.identity, source: input.source, status: input.status, headers: input.headers, requestId: input.requestId })
}
