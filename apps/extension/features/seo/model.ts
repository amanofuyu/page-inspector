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
}
export type SeoGroup
  = | 'basic'
    | 'indexing'
    | 'social'
    | 'languages'
    | 'structured'
    | 'headings'
    | 'transport'
export type SeoSource = 'live-dom' | 'navigation-response' | 'refetch-reference'
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
}
export interface SeoField {
  id: string
  key: string
  label: string
  group: SeoGroup
  value: string
  normalized: string
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
  association: 'matched' | 'reference'
  url: string
  sampledAt: number
  complete: boolean
  reasons: string[]
  fields: SeoField[]
  status?: number
  headers?: SeoHeader[]
  requestId?: string
}
export interface SeoHtmlInput {
  text: string
  url: string
  source: Exclude<SeoSource, 'live-dom'>
  association: SeoSnapshot['association']
  identity: SeoIdentity
  sampledAt: number
  status: number
  headers: SeoHeader[]
  requestId?: string
}
export type SeoChange
  = | 'initial'
    | 'added'
    | 'changed'
    | 'removed'
    | 'unknown'
    | 'reference'
    | 'transport'
export interface SeoRow {
  id: string
  key: string
  label: string
  group: SeoGroup
  html?: SeoField
  dom?: SeoField
  change: SeoChange
}
export interface SeoIssue {
  id: string
  level: 'problem' | 'review' | 'info'
  title: string
  detail: string
  key: string
}
export const GROUPS: Record<SeoGroup, string> = {
  basic: '基础标签',
  indexing: '收录与规范化',
  social: '社交分享',
  languages: '多语言',
  structured: '结构化数据',
  headings: '正文标题（H1）',
  transport: 'HTTP 响应',
}
export const CHANGES: Record<SeoChange, string> = {
  initial: '初始已有',
  added: '运行后新增',
  changed: '运行后修改',
  removed: '运行后删除',
  unknown: '来源未确认',
  reference: '参考对比',
  transport: '响应信息',
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
