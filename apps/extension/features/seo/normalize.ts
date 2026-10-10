import type { SeoField, SeoGroup, SeoNode, SeoRaw, SeoSnapshot } from './model'
import { headerCanonicals } from './link-header'
import { readMicrodata } from './microdata'
import { buildPageData } from './page-data'

function escape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
export function normalizeSeo(raw: SeoRaw): SeoField[] {
  const counts = new Map<string, number>()
  const fields: SeoField[] = []
  for (const node of raw.nodes) {
    const { tag, attrs, text } = node
    let key = ''
    let label = ''
    let value = text
    let group: SeoGroup = 'basic'
    if (tag === 'html') {
      key = 'html:lang'
      label = 'html lang'
      value = attrs.lang ?? ''
    }
    else if (tag === 'title') {
      key = 'title'
      label = 'title'
    }
    else if (tag === 'base') {
      key = 'base'
      label = 'base URL'
      value = attrs.href ?? ''
    }
    else if (tag === 'meta') {
      const name = (
        attrs.name
        ?? attrs.property
        ?? attrs['http-equiv']
        ?? (attrs.charset !== undefined ? 'charset' : '')
      )
        .toLowerCase()
        .trim()
      if (!name)
        continue
      key = `meta:${name}`
      label = name
      value = attrs.charset ?? attrs.content ?? ''
      if (name === 'robots' || name.startsWith('googlebot'))
        group = 'indexing'
      else if (/^(?:og:|twitter:)/.test(name))
        group = 'social'
    }
    else if (tag === 'link') {
      const rel = (attrs.rel ?? '').toLowerCase().split(/\s+/)
      if (rel.includes('canonical')) {
        key = 'link:canonical'
        label = 'canonical'
        group = 'indexing'
      }
      else if (rel.includes('alternate') && attrs.hreflang !== undefined) {
        key = `link:alternate:${attrs.hreflang.toLowerCase()}`
        label = `hreflang · ${attrs.hreflang}`
        group = 'languages'
      }
      else {
        continue
      }
      value = attrs.href ?? ''
    }
    else if (/^h[1-6]$/.test(tag)) {
      key = `heading:${tag}`
      label = tag.toUpperCase()
      group = 'headings'
    }
    else if (tag === 'script') {
      key = 'jsonld'
      label = 'JSON-LD'
      group = 'structured'
    }
    else if (tag === 'header') {
      key = `http:${attrs.name}`
      label = attrs.name ?? 'HTTP'
      value = text
      group = 'transport'
    }
    else {
      continue
    }
    const index = (counts.get(key) ?? 0) + 1
    counts.set(key, index)
    const field: SeoField = {
      id: `${key}:${index}`,
      key,
      label,
      group,
      value,
      location: node.location,
      snippet: snippet(node),
      truncated: !!node.truncated,
    }
    if (group === 'structured' && !node.truncated) {
      try {
        const parsed = JSON.parse(text)
        const roots = Array.isArray(parsed) ? parsed : [parsed]
        const types = new Set<string>()
        for (const root of roots) {
          const records
            = root && typeof root === 'object' && Array.isArray(root['@graph'])
              ? [root, ...root['@graph']]
              : [root]
          for (const item of records) {
            const type
              = item && typeof item === 'object' ? item['@type'] : undefined
            for (const name of Array.isArray(type) ? type : [type]) {
              if (typeof name === 'string')
                types.add(name)
            }
          }
        }
        field.jsonTypes = [...types].slice(0, 50)
        if (field.jsonTypes.length)
          field.label += ` · ${field.jsonTypes.join(' / ')}`
        if (parsed === null || typeof parsed !== 'object')
          field.jsonError = 'JSON-LD 根节点应为对象或数组。'
      }
      catch (error) {
        if (error instanceof SyntaxError)
          field.jsonError = error.message
        else field.truncated = true
      }
    }
    fields.push(field)
    if (key === 'http:link' && !field.truncated) {
      for (const canonical of headerCanonicals(value, raw.url)) {
        const key = 'http:canonical'
        const index = (counts.get(key) ?? 0) + 1
        counts.set(key, index)
        fields.push({
          id: `${key}:${index}`,
          key,
          label: 'Link canonical',
          group: 'transport',
          value: canonical.target,
          location: 'header',
          snippet: canonical.snippet,
          truncated: false,
        })
      }
    }
  }
  return fields
}
function snippet(node: SeoNode) {
  if (node.tag === 'header')
    return `${node.attrs.name}: ${node.text}`
  const attrs = Object.entries(node.attrs)
    .map(([key, value]) => ` ${key}="${escape(value)}"`)
    .join('')
  const content
    = node.tag === 'script'
      ? node.text.replaceAll('<', '\\u003C')
      : escape(node.text)
  return ['meta', 'link', 'base'].includes(node.tag)
    ? `<${node.tag}${attrs}>`
    : `<${node.tag}${attrs}>${content}</${node.tag}>`
}
export function buildSeoSnapshot(
  raw: SeoRaw,
  info: Omit<
    SeoSnapshot,
    'fields' | 'complete' | 'reasons' | 'url' | 'sampledAt'
  >,
): SeoSnapshot {
  const fields = normalizeSeo(raw)
  const page = buildPageData(raw)
  const microdata = readMicrodata(raw.microdata ?? [], page.baseUrl)
  for (const { index, value } of microdata.items) {
    const text = JSON.stringify(value, null, 2)
    fields.push({ id: `microdata:${index}`, key: 'microdata', label: `Microdata${value?.type.length ? ` · ${value.type.join(' / ')}` : ''}`, group: 'structured', value: text, location: raw.microdata![index]!.location, snippet: text, truncated: microdata.truncated })
  }
  const complete = raw.complete && !fields.some(field => field.truncated)
  return {
    ...info,
    url: raw.url,
    sampledAt: raw.sampledAt,
    complete,
    reasons:
      complete || raw.reasons.length
        ? raw.reasons
        : ['部分字段超过读取预算。'],
    fields,
    page,
  }
}
