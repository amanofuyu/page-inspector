import type { SEO_LIMITS, SeoRaw } from './model'

/** 注入函数必须自包含；仅采样主文档，不修改页面或访问框架私有对象。 */
export function collectSeoDom(limits: typeof SEO_LIMITS): SeoRaw {
  const raw: SeoRaw = {
    url: location.href,
    initialUrl: performance.getEntriesByType('navigation')[0]?.name ?? '',
    navigationStart: performance.timeOrigin,
    sampledAt: Date.now(),
    nodes: [],
    microdata: [],
    complete: true,
    reasons: [],
    frames: document.querySelectorAll('iframe, frame').length,
  }
  const fail = (reason: string) => {
    raw.complete = false
    if (!raw.reasons.includes(reason))
      raw.reasons.push(reason)
  }
  if (document.readyState === 'loading')
    fail('文档仍在加载，当前结果不能确认字段缺失。')
  const started = performance.now()
  const encoder = new TextEncoder()
  const text: string[] = []
  let textLength = 0
  const addText = (value: string) => {
    const left = limits.bodyText - textLength
    if (value.length > left)
      fail('正文文本超过计数预算，字数仅覆盖已读取部分。')
    if (left > 0) {
      text.push(value.slice(0, left))
      textLength += Math.min(value.length, left)
    }
  }
  let bytes = encoder.encode(JSON.stringify(raw)).byteLength + 2048
  let scanned = 0
  let metadata = 0
  let headings = 0
  const attrs = ['name', 'property', 'content', 'http-equiv', 'charset', 'rel', 'href', 'hreflang', 'lang', 'id', 'type', 'src', 'alt', 'title', 'width', 'height', 'itemscope', 'itemtype', 'itemprop', 'itemref', 'itemid', 'value', 'datetime', 'data']
  const references = new Set<string>()
  for (const element of document.querySelectorAll('[itemscope][itemref]')) {
    if (performance.now() - started > limits.scanMs) {
      fail('Microdata 引用扫描达到时间预算。')
      break
    }
    for (const id of (element.getAttribute('itemref') ?? '').split(/\s+/))
      references.add(id)
  }
  const blocks = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'td', 'th', 'tr', 'ul'])
  const pending: { node: Node | null, parent: number | null, body: boolean, skipWords: boolean }[] = [{ node: document.documentElement, parent: null, body: false, skipWords: false }]
  while (pending.length) {
    if (++scanned > limits.nodes || performance.now() - started > limits.scanMs) {
      fail('DOM 扫描达到节点或时间预算，结果仅覆盖已读取部分。')
      break
    }
    const { node, parent, body, skipWords } = pending.pop()!
    if (!node) {
      addText(' ')
      continue
    }
    if (node.nodeType === Node.TEXT_NODE) {
      if (body && !skipWords)
        addText(node.nodeValue ?? '')
      continue
    }
    if (!(node instanceof Element) || node.namespaceURI !== 'http://www.w3.org/1999/xhtml')
      continue
    const tag = node.localName
    if (tag === 'noscript' || tag === 'template')
      continue
    const inBody = body || tag === 'body'
    const excludedWords = skipWords || ['script', 'style'].includes(tag) || node.hasAttribute('hidden')
    const block = inBody && !excludedWords && blocks.has(tag)
    if (block)
      addText(' ')
    const heading = /^h[1-6]$/.test(tag)
    const selected = ['html', 'title', 'meta', 'link', 'base', 'a', 'img'].includes(tag) || heading || (tag === 'script' && node.getAttribute('type')?.trim().toLowerCase() === 'application/ld+json')
    const micro = node.hasAttribute('itemscope') || node.hasAttribute('itemprop') || references.has(node.id)
    let microParent = parent
    if (selected || micro) {
      const properties: Record<string, string> = {}
      let truncated = false
      for (const key of attrs) {
        const value = node.getAttribute(key)
        if (value !== null) {
          truncated ||= value.length > limits.value
          properties[key] = value.slice(0, limits.value)
        }
      }
      if (tag === 'img') {
        const image = node as HTMLImageElement
        if (image.currentSrc) {
          truncated ||= image.currentSrc.length > limits.value
          properties['current-src'] = image.currentSrc.slice(0, limits.value)
        }
        properties.width ||= image.naturalWidth ? String(image.naturalWidth) : ''
        properties.height ||= image.naturalHeight ? String(image.naturalHeight) : ''
      }
      const fullText = heading || tag === 'title' || tag === 'script' || tag === 'a' || (node.hasAttribute('itemprop') && !node.hasAttribute('itemscope')) ? node.textContent ?? '' : ''
      const max = tag === 'script' ? limits.json : limits.value
      truncated ||= fullText.length > max
      const entry = { tag, attrs: properties, text: fullText.slice(0, max), location: tag === 'html' ? 'html' as const : document.head?.contains(node) ? 'head' as const : 'body' as const, truncated }
      if (selected) {
        if ((heading ? ++headings > limits.headings : !['a', 'img'].includes(tag) && ++metadata > limits.metadata) || raw.nodes.length >= limits.records) {
          fail('SEO 标签数量达到预算，结果仅覆盖已读取部分。')
          break
        }
        const size = encoder.encode(JSON.stringify(entry)).byteLength + 1
        if (bytes + size > limits.textBytes) {
          fail('SEO 文本达到 2 MiB 消息预算。')
          break
        }
        bytes += size
        raw.nodes.push(entry)
      }
      if (micro) {
        if (raw.microdata!.length < limits.microdata) {
          const record = { ...entry, parent }
          const size = encoder.encode(JSON.stringify(record)).byteLength + 1
          if (bytes + size > limits.textBytes) {
            fail('SEO 文本达到 2 MiB 消息预算。')
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
        fail('部分标签超过单项长度预算。')
    }
    if (block)
      pending.push({ node: null, parent: microParent, body: inBody, skipWords: excludedWords })
    if (!['script', 'style'].includes(tag)) {
      for (let index = node.childNodes.length - 1; index >= 0; index--)
        pending.push({ node: node.childNodes[index]!, parent: microParent, body: inBody, skipWords: excludedWords })
    }
  }
  const content = text.join('').trim()
  raw.wordCount = content ? content.split(/\s+/u).length : 0
  return raw
}
