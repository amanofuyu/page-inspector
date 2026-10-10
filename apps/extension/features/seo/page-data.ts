import type { SeoPageData, SeoRaw } from './model'

/** 保留原始属性；地址解析只用于分类、打开和预览。 */
export function resolveSeoUrl(value: string | null | undefined, base: string) {
  if (value == null)
    return ''
  try {
    return (base ? new URL(value, base) : new URL(value)).href
  }
  catch {
    return ''
  }
}

export function safeSeoUrl(value: string | null | undefined, base = '') {
  if (!value?.trim())
    return ''
  const url = resolveSeoUrl(value, base)
  return /^https?:\/\//i.test(url) ? url : ''
}

export function buildPageData(raw: SeoRaw): SeoPageData {
  const base = raw.nodes.find(node => node.tag === 'base' && node.attrs.href !== undefined)
  const baseUrl = resolveSeoUrl(base?.attrs.href, raw.url) || raw.url
  const host = new URL(raw.url).hostname.toLowerCase()
  const page: SeoPageData = { baseUrl, wordCount: raw.wordCount ?? null, links: [], images: [] }
  for (const node of raw.nodes) {
    if (node.tag === 'a') {
      const href = node.attrs.href ?? null
      const url = resolveSeoUrl(href, baseUrl)
      let kind: 'internal' | 'external' | 'other' = 'other'
      if (/^https?:\/\//i.test(url))
        kind = new URL(url).hostname.toLowerCase() === host ? 'internal' : 'external'
      page.links.push({ id: `link:${page.links.length + 1}`, href, url, kind, text: node.text.trim(), title: node.attrs.title ?? '', rel: (node.attrs.rel ?? '').toLowerCase().split(/\s+/).filter(Boolean), truncated: !!node.truncated })
    }
    if (node.tag === 'img') {
      const src = node.attrs.src ?? null
      page.images.push({ id: `image:${page.images.length + 1}`, src, url: resolveSeoUrl(node.attrs['current-src'] || src, baseUrl), alt: node.attrs.alt ?? null, title: node.attrs.title ?? '', width: node.attrs.width ?? '', height: node.attrs.height ?? '', truncated: !!node.truncated })
    }
  }
  return page
}
