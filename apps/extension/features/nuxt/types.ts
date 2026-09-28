export const MAX_PAYLOAD_BYTES = 12 * 1024 * 1024
export const MAX_APPLICATIONS = 16
export interface RawSource {
  kind: 'inline' | 'external'
  url: string | null
  text: string | null
  bytes: number
  fetchedAt: number
  sourceId?: string
  snapshotId?: string
  documentId?: string | null
  transport?: 'dom' | 'extension-fetch' | 'devtools-response'
  rawUtf8Bytes?: number | null
  messageBytes?: number | null
  readBytesLowerBound?: number
  complete?: boolean
  error?: string
}
export interface CollectedApp {
  id: string
  label: string
  declaredId?: string | null
  serverRendered: boolean | null
  externalUrl: string | null
  sources: RawSource[]
}
export interface PageSnapshot {
  pageUrl: string
  initialUrl: string | null
  title: string
  collectedAt: number
  snapshotId?: string
  navigationStartedAt?: number
  apps: CollectedApp[]
  warnings: string[]
}
export interface CrawlRequest {
  tabId: number
  requestId: string
  clientId: string
}
export interface CrawlResponse {
  tabId: number
  requestId: string
  documentId: string | null
  status: 'ready' | 'empty' | 'error' | 'stale'
  snapshot: PageSnapshot | null
  message?: string
}
export interface ParsedApp {
  status: 'ready' | 'partial' | 'unsupported' | 'error'
  payload: Record<string, unknown> | null
  diagnostics: string[]
  app: CollectedApp
  sources: ParsedSource[]
  fieldSources: Record<string, string[]>
}
export interface ParsedSource {
  sourceId: string
  payload: Record<string, unknown> | null
  status: 'ready' | 'partial' | 'error'
  diagnostic?: string
}
/** 仅保存类型和数据，不执行页面的响应式逻辑或自定义函数。 */
export class PayloadTag {
  constructor(public type: string, public value: unknown, public unsupported = false) { }
}
export function unwrap(value: unknown): unknown {
  const seen = new Set<PayloadTag>()
  while (value instanceof PayloadTag && !seen.has(value)) {
    seen.add(value)
    value = value.value
  }
  return value
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}
