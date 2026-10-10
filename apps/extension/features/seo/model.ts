export const SEO_LIMITS = {
  htmlBytes: 5 * 1024 * 1024,
  textBytes: 2 * 1024 * 1024,
  nodes: 100000,
  records: 12000,
  metadata: 2000,
  headings: 10000,
  value: 16384,
  json: 1024 * 1024,
  scanMs: 250,
  microdata: 2000,
  bodyText: 1024 * 1024,
}
export type SeoGroup
  = | 'basic'
    | 'indexing'
    | 'social'
    | 'languages'
    | 'structured'
    | 'headings'
    | 'transport'
export type SeoSource = 'live-dom' | 'navigation-response' | 'reference-response'
export interface SeoIdentity {
  tabId: number
  documentId: string
  url: string
  initialUrl: string
  navigationStart: number
}
export interface SeoNode {
  tag: string
  attrs: Record<string, string>
  text: string
  location: 'head' | 'body' | 'html' | 'header'
  truncated?: boolean
}
export interface SeoRaw {
  url: string
  initialUrl: string
  navigationStart: number
  sampledAt: number
  nodes: SeoNode[]
  complete: boolean
  reasons: string[]
  frames: number
  wordCount?: number
  microdata?: SeoMicrodataNode[]
}
export interface SeoMicrodataNode extends SeoNode { parent: number | null }
export interface SeoLink {
  id: string
  href: string | null
  url: string
  text: string
  title: string
  rel: string[]
  kind: 'internal' | 'external' | 'other'
  truncated: boolean
}
export interface SeoImage {
  id: string
  src: string | null
  url: string
  alt: string | null
  title: string
  width: string
  height: string
  truncated: boolean
}
export interface SeoPageData {
  baseUrl: string
  wordCount: number | null
  links: SeoLink[]
  images: SeoImage[]
}
export interface SeoField {
  id: string
  key: string
  label: string
  group: SeoGroup
  value: string
  location: SeoNode['location']
  snippet: string
  truncated: boolean
  jsonError?: string
  jsonTypes?: string[]
}
export interface SeoHeader {
  name: string
  value: string
  truncated?: boolean
}
export interface SeoSnapshot {
  identity: SeoIdentity
  source: SeoSource
  url: string
  sampledAt: number
  complete: boolean
  reasons: string[]
  fields: SeoField[]
  status?: number
  headers?: SeoHeader[]
  requestId?: string
  page?: SeoPageData
}
export interface SeoHtmlInput {
  text: string
  url: string
  source: Exclude<SeoSource, 'live-dom'>
  identity: SeoIdentity
  sampledAt: number
  status: number
  headers: SeoHeader[]
  requestId?: string
}
export const GROUPS: Record<SeoGroup, string> = {
  basic: '基础标签',
  indexing: '收录与规范化',
  social: '社交分享',
  languages: '多语言',
  structured: '结构化数据',
  headings: '正文标题（H1–H6）',
  transport: 'HTTP 响应',
}
export function sameSeoIdentity(a: SeoIdentity, b: SeoIdentity) {
  return (
    a.tabId === b.tabId
    && a.documentId === b.documentId
    && a.url === b.url
    && a.initialUrl === b.initialUrl
    && a.navigationStart === b.navigationStart
  )
}
