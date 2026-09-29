import type { SEO_LIMITS, SeoRaw } from './model'

/** 注入函数必须自包含；只读取主文档的标签，不访问框架私有对象。 */
export function collectSeoDom(limits: typeof SEO_LIMITS): SeoRaw {
  const raw: SeoRaw = {
    url: location.href,
    initialUrl: performance.getEntriesByType('navigation')[0]?.name ?? '',
    navigationStart: performance.timeOrigin,
    sampledAt: Date.now(),
    nodes: [],
    complete: true,
    reasons: [],
    frames: document.querySelectorAll('iframe, frame').length,
  }
  if (document.readyState === 'loading') {
    raw.complete = false
    raw.reasons.push('文档仍在加载，当前结果不能确认字段缺失。')
  }
  const started = performance.now()
  const encoder = new TextEncoder()
  let bytes = 0
  let scanned = 0
  let metadata = 0
  let headings = 0
  const walker = document.createTreeWalker(
    document.documentElement,
    NodeFilter.SHOW_ELEMENT,
  )
  const attrs = [
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
  ]
  let current: Node | null = walker.currentNode
  while (current) {
    if (
      ++scanned > limits.nodes
      || performance.now() - started > limits.scanMs
    ) {
      raw.complete = false
      raw.reasons.push('DOM 扫描达到节点或时间预算，缺失状态无法确认。')
      break
    }
    const element = current as Element
    const tag = element.localName
    const heading = tag === 'h1'
    const selected
      = element.namespaceURI === 'http://www.w3.org/1999/xhtml'
        && (['html', 'title', 'meta', 'link', 'base'].includes(tag)
          || heading
          || (tag === 'script'
            && element.getAttribute('type')?.trim().toLowerCase()
            === 'application/ld+json'))
    if (selected) {
      if (
        (heading
          ? ++headings > limits.headings
          : ++metadata > limits.metadata)
        || raw.nodes.length >= limits.records
      ) {
        raw.complete = false
        raw.reasons.push('SEO 标签数量达到预算，结果仅覆盖已读取部分。')
        break
      }
      const properties: Record<string, string> = {}
      let truncated = false
      for (const key of attrs) {
        const value = element.getAttribute(key)
        if (value !== null) {
          truncated ||= value.length > limits.value
          properties[key] = value.slice(0, limits.value)
        }
      }
      const fullText
        = heading || tag === 'title' || tag === 'script'
          ? (element.textContent ?? '')
          : ''
      const max = tag === 'script' ? limits.json : limits.value
      truncated ||= fullText.length > max
      const node = {
        tag,
        attrs: properties,
        text: fullText.slice(0, max),
        location:
          tag === 'html'
            ? ('html' as const)
            : document.head?.contains(element)
              ? ('head' as const)
              : ('body' as const),
        truncated,
      }
      bytes += encoder.encode(JSON.stringify(node)).byteLength
      if (bytes > limits.textBytes) {
        raw.complete = false
        raw.reasons.push('SEO 文本达到 2 MiB 消息预算。')
        break
      }
      if (truncated) {
        raw.complete = false
        if (!raw.reasons.includes('部分标签超过单项长度预算。'))
          raw.reasons.push('部分标签超过单项长度预算。')
      }
      raw.nodes.push(node)
    }
    current = walker.nextNode()
  }
  return raw
}
