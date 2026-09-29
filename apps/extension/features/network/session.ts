import type { CollectedApp, PageSnapshot, RawSource } from '../nuxt/types'

export const NETWORK_LIMITS = { records: 500, metadataBytes: 2 * 1024 * 1024, bodyBytes: 12 * 1024 * 1024 }
export interface HarRequest {
  startedDateTime?: string
  time?: number
  pageref?: string
  _resourceType?: string
  request?: {
    url?: string
    method?: string
  }
  response?: {
    headers?: { name: string, value: string }[]
    status?: number
    bodySize?: number
    redirectURL?: string
    content?: {
      size?: number
      mimeType?: string
    }
    _fromCache?: boolean
  }
  getContent?: (callback: (content: string, encoding: string) => void) => void
}
export interface NetworkRecord {
  id: string
  generation: number | null
  documentId: string | null
  url: string
  method: string
  status: number | null
  startedAt: number | null
  durationMs: number | null
  resourceType: string
  mime: string
  contentSize: number | null
  bodySize: number | null
  pageRef: string | null
  pageStartedAt: number | null
  redirectUrl: string | null
  cache: boolean
  imported: boolean
  ambiguous: boolean
  metadataBytes: number
  bodyState: 'unread' | 'loading' | 'ready' | 'unavailable' | 'evicted'
  bodyError?: string
  bodyUtf8Bytes?: number
  manualCandidate?: boolean
}
export interface ResponseBody {
  text: string
  bytes: number
  encoding: string
}
export interface NetworkApi {
  onRequestFinished: {
    addListener: (listener: (request: HarRequest) => void) => void
    removeListener: (listener: (request: HarRequest) => void) => void
  }
  onNavigated: {
    addListener: (listener: (url: string) => void) => void
    removeListener: (listener: (url: string) => void) => void
  }
  getHAR: (callback: (har: {
    entries?: HarRequest[]
    pages?: {
      id: string
      startedDateTime: string
    }[]
  }) => void) => void
}
function size(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}
function time(value: string | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}
function fingerprint(request: HarRequest) {
  return JSON.stringify([request.startedDateTime, request.request?.url, request.request?.method, request.response?.status, request.time, request.pageref])
}
/** 请求对象仅留在真实 DevTools 会话，正文按需读取且独立于扩展重新获取。 */
export class NetworkSession {
  readonly sessionId = crypto.randomUUID()
  readonly observedAt = Date.now()
  records: NetworkRecord[] = []
  preserve = false
  generation = 0
  dropped = 0
  metadataBytes = 0
  bodyBytes = 0
  private sequence = 0
  private active = false
  private handles = new Map<string, HarRequest>()
  private bodies = new Map<string, ResponseBody>()
  private seen = new WeakSet<object>()
  private pages = new Map<string, number>()
  private documents = new Map<number, {
    id: string
    navigationStartedAt: number
  }>()

  private api: NetworkApi | null = null
  private reads = new Map<string, {
    timer: ReturnType<typeof setTimeout>
    reject: (error: Error) => void
  }>()

  private cancelReads() {
    for (const read of this.reads.values()) {
      clearTimeout(read.timer)
      read.reject(new Error('页面已导航或会话已结束，忽略迟到正文。'))
    }
    this.reads.clear()
  }

  private harPending = false
  private harTimer: ReturnType<typeof setTimeout> | undefined
  constructor(private changed: () => void = () => {
  }) {
  }

  private onFinished = (request: HarRequest) => {
    this.add(request, false)
    if (request.pageref && !this.pages.has(request.pageref))
      this.scheduleHar()
  }

  private onNavigated = (_url: string) => {
    this.generation++
    this.cancelReads()
    if (!this.preserve) {
      this.clear()
      this.seen = new WeakSet()
    }
    this.scheduleHar()
    this.changed()
  }

  /** HAR 只精确到毫秒；用采集文档的导航起点核对，不用导航通知的到达时间猜测。 */
  setDocument(documentId: string, navigationStartedAt: number) {
    if (!documentId || !Number.isFinite(navigationStartedAt))
      return
    // 页面切换期间旧采集结果可能仍在界面中，不能把它重新绑定到新一代。
    if ([...this.documents].some(([generation, document]) => generation !== this.generation && document.id === documentId))
      return
    this.documents.set(this.generation, { id: documentId, navigationStartedAt })
    if (this.documents.size > 20)
      this.documents.delete(this.documents.keys().next().value!)
    this.reconcileDocuments()
    this.changed()
  }

  private identifyDocument(record: NetworkRecord) {
    const matches = record.pageStartedAt === null ? [] : [...this.documents].filter(([, document]) => Math.abs(document.navigationStartedAt - record.pageStartedAt!) <= 1)
    const match = matches.length === 1 ? matches[0] : undefined
    record.generation = match?.[0] ?? null
    record.documentId = match?.[1].id ?? null
  }

  private reconcileDocuments() {
    for (const record of [...this.records]) {
      this.identifyDocument(record)
      // 未知归属仍保留；只有已核实属于旧文档的请求才按导航清理规则释放。
      if (!this.preserve && record.generation !== null && record.generation !== this.generation) {
        this.evict(record.id)
      }
      else {
        const bytes = new TextEncoder().encode(JSON.stringify({ ...record, metadataBytes: 0 })).byteLength
        this.metadataBytes += bytes - record.metadataBytes
        record.metadataBytes = bytes
      }
    }
    while (this.records.length && this.metadataBytes > NETWORK_LIMITS.metadataBytes)
      this.evict(this.records[0]!.id)
  }

  private scheduleHar() {
    if (this.harPending || this.harTimer)
      return
    this.harTimer = setTimeout(() => {
      this.harTimer = undefined
      this.loadHar()
    }, 300)
  }

  start(api: NetworkApi) {
    this.active = true
    this.api = api
    api.onRequestFinished.addListener(this.onFinished)
    api.onNavigated.addListener(this.onNavigated)
    this.loadHar()
  }

  private loadHar() {
    if (!this.api || !this.active)
      return
    this.harPending = true
    const generation = this.generation
    this.api.getHAR((har) => {
      this.harPending = false
      if (!this.active)
        return
      if (generation !== this.generation) {
        this.scheduleHar()
        return
      }
      for (const page of har.pages ?? []) {
        const date = time(page.startedDateTime)
        if (date !== null)
          this.pages.set(page.id, date)
        if (this.pages.size > 20)
          this.pages.delete(this.pages.keys().next().value!)
      }
      const existing = new Map<string, number>()
      for (const request of this.handles.values()) {
        const key = fingerprint(request)
        existing.set(key, (existing.get(key) ?? 0) + 1)
      }
      for (const request of har.entries ?? []) {
        const key = fingerprint(request)
        const count = existing.get(key) ?? 0
        if (count > 0)
          existing.set(key, count - 1)
        else
          this.add(request, true)
      }
      for (const record of this.records)
        record.pageStartedAt = record.pageRef ? this.pages.get(record.pageRef) ?? record.pageStartedAt : record.pageStartedAt
      this.reconcileDocuments()
      this.changed()
    })
  }

  add(request: HarRequest, imported: boolean) {
    if (!this.active || this.seen.has(request))
      return
    this.seen.add(request)
    const url = request.request?.url ?? ''
    // 巨型 URL 不能截断后参加“完整 URL”关联，直接忽略该条元信息。
    if (!url || url.length > 32768) {
      this.dropped++
      this.changed()
      return
    }
    const key = fingerprint(request)
    const overlaps = this.records.filter(record => fingerprint(this.handles.get(record.id)!) === key)
    if (!imported && overlaps.length === 1 && overlaps[0]!.imported) {
      const previous = overlaps[0]!
      previous.imported = false
      this.handles.set(previous.id, request)
      this.changed()
      return
    }
    const startedAt = time(request.startedDateTime)
    const record: NetworkRecord = {
      id: `${this.sessionId}:${++this.sequence}`,
      generation: null,
      documentId: null,
      url,
      method: (request.request?.method ?? '?').slice(0, 32),
      status: size(request.response?.status),
      startedAt,
      durationMs: size(request.time),
      resourceType: (request._resourceType ?? '').slice(0, 80),
      mime: (request.response?.content?.mimeType ?? '').slice(0, 160),
      contentSize: size(request.response?.content?.size),
      bodySize: size(request.response?.bodySize),
      pageRef: request.pageref?.slice(0, 256) ?? null,
      pageStartedAt: request.pageref ? this.pages.get(request.pageref) ?? null : null,
      redirectUrl: request.response?.redirectURL?.slice(0, 32768) || null,
      cache: request.response?._fromCache === true,
      imported,
      ambiguous: overlaps.length > 0,
      metadataBytes: 0,
      bodyState: 'unread',
    }
    this.identifyDocument(record)
    if (!this.preserve && record.generation !== null && record.generation !== this.generation)
      return
    record.metadataBytes = new TextEncoder().encode(JSON.stringify(record)).byteLength
    while (this.records.length && (this.records.length >= NETWORK_LIMITS.records || this.metadataBytes + record.metadataBytes > NETWORK_LIMITS.metadataBytes))
      this.evict(this.records[0]!.id)
    this.records.push(record)
    this.metadataBytes += record.metadataBytes
    this.handles.set(record.id, request)
    this.changed()
  }

  private evict(id: string) {
    const index = this.records.findIndex(record => record.id === id)
    if (index >= 0) {
      this.metadataBytes -= this.records[index]!.metadataBytes
      this.records.splice(index, 1)
      this.dropped++
    }
    this.handles.delete(id)
    this.removeBody(id)
  }

  private removeBody(id: string) {
    const body = this.bodies.get(id)
    if (body) {
      this.bodyBytes -= body.bytes
      this.bodies.delete(id)
    }
    const record = this.records.find(item => item.id === id)
    if (record?.bodyState === 'ready')
      record.bodyState = 'evicted'
  }

  body(id: string) {
    const body = this.bodies.get(id)
    if (body) {
      this.bodies.delete(id)
      this.bodies.set(id, body)
    }
    return body
  }

  /** 仅按需公开 SEO 有关响应头，不保存请求凭据或 Set-Cookie。 */
  seoHeaders(id: string) {
    return (this.handles.get(id)?.response?.headers ?? [])
      .filter(header => ['x-robots-tag', 'link', 'content-type'].includes(header.name.toLowerCase()))
      .slice(0, 100)
      .map(header => ({ name: header.name.toLowerCase(), value: header.value.slice(0, 16384), truncated: header.value.length > 16384 }))
  }

  async read(id: string): Promise<ResponseBody> {
    const cached = this.body(id)
    if (cached)
      return cached
    const record = this.records.find(item => item.id === id)
    const request = this.handles.get(id)
    if (!record || !request)
      throw new Error('请求记录已释放。')
    if (record.bodyState === 'loading')
      throw new Error('该响应正在读取。')
    if (record.contentSize === null)
      throw new Error('响应大小未知，默认仅保留元信息。')
    if (record.contentSize > NETWORK_LIMITS.bodyBytes)
      throw new Error('响应超过 12 MiB 读取预算。')
    if (!request.getContent)
      throw new Error('浏览器未保留此历史请求的正文读取能力。')
    record.bodyState = 'loading'
    this.changed()
    const generation = this.generation
    try {
      const body = await new Promise<ResponseBody>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.reads.delete(id)
          reject(new Error('正文读取超时。'))
        }, 8000)
        this.reads.set(id, { timer, reject })
        request.getContent!((content, encoding) => {
          if (!this.reads.has(id))
            return
          this.reads.delete(id)
          clearTimeout(timer)
          try {
            if (!this.active || generation !== this.generation || !this.handles.has(id))
              throw new Error('页面已导航或请求已释放，忽略迟到正文。')
            if (typeof content !== 'string' || content.length > NETWORK_LIMITS.bodyBytes * (encoding === 'base64' ? 4 / 3 : 1) + 4)
              throw new Error('正文不可用或超过读取预算。')
            if (encoding && encoding !== 'base64')
              throw new Error(`不支持的正文编码：${encoding}`)
            const text = encoding === 'base64' ? new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(content), char => char.charCodeAt(0))) : content
            const bytes = new TextEncoder().encode(text).byteLength
            if (bytes > NETWORK_LIMITS.bodyBytes)
              throw new Error('解码后文本超过 12 MiB 缓存预算。')
            if (!text && (record.contentSize! > 0 || record.status === 304))
              throw new Error('浏览器未提供可核对的响应正文。')
            resolve({ text, bytes, encoding: encoding || 'text' })
          }
          catch (error) {
            reject(error)
          }
        })
      })
      if (!this.active || generation !== this.generation || !this.handles.has(id))
        throw new Error('页面已导航或请求已释放，忽略迟到正文。')
      while (this.bodies.size && this.bodyBytes + body.bytes > NETWORK_LIMITS.bodyBytes)
        this.removeBody(this.bodies.keys().next().value!)
      this.bodies.set(id, body)
      this.bodyBytes += body.bytes
      record.bodyState = 'ready'
      record.bodyError = undefined
      record.bodyUtf8Bytes = body.bytes
      this.changed()
      return body
    }
    catch (error) {
      record.bodyState = 'unavailable'
      record.bodyError = error instanceof Error ? error.message : String(error)
      this.changed()
      throw error
    }
  }

  clear() {
    this.cancelReads()
    this.records = []
    this.handles.clear()
    this.bodies.clear()
    this.bodyBytes = 0
    this.metadataBytes = 0
    this.changed()
  }

  dispose() {
    this.active = false
    clearTimeout(this.harTimer)
    this.api?.onRequestFinished.removeListener(this.onFinished)
    this.api?.onNavigated.removeListener(this.onNavigated)
    this.clear()
    this.pages.clear()
    this.documents.clear()
  }
}
export interface Association {
  level: '内容已核对' | '来源候选' | '业务候选' | '无法关联'
  reason: string
  source?: RawSource
}
export function associate(record: NetworkRecord, body: ResponseBody | undefined, snapshot: PageSnapshot | null | undefined, app: CollectedApp | undefined, documentId: string | null | undefined): Association {
  const source = app?.sources.find(source => source.kind === 'external' && source.url === record.url)
  if (!source)
    return record.manualCandidate ? { level: '业务候选', reason: '用户手动标记，不证明 payload 字段由该请求产生。' } : { level: '无法关联', reason: '未匹配声明的完整外部 URL；SSR 服务端请求不在浏览器观察范围。' }
  if (!body || source.text === null)
    return { level: '来源候选', reason: '完整 URL 一致，正文尚未取得或不可读。', source }
  if (body.text !== source.text)
    return { level: '来源候选', reason: '完整 URL 一致，但浏览器响应与扩展取得的原文不同。', source }
  const navigation = snapshot?.navigationStartedAt
  const sameDocument = !!documentId && record.documentId === documentId && navigation !== undefined && record.pageStartedAt !== null && Math.abs(record.pageStartedAt - navigation) <= 1 && record.startedAt !== null && record.startedAt >= navigation - 100 && record.startedAt <= snapshot!.collectedAt && !record.ambiguous
  if (!sameDocument)
    return { level: '来源候选', reason: '正文一致，但 HAR 页面或当前文档归属未核实。', source }
  if (record.redirectUrl || record.status === null || record.status < 200 || record.status >= 300)
    return { level: '来源候选', reason: '正文一致，但重定向、缓存状态或响应状态需要额外核对。', source }
  return { level: '内容已核对', reason: '声明的完整 URL、HAR 导航时间、当前文档身份与响应原文均已核对；不代表业务 API 到字段的映射。', source }
}
export function responseSnapshot(record: NetworkRecord, body: ResponseBody, current: PageSnapshot | null | undefined): {
  snapshot: PageSnapshot
  app: CollectedApp
} {
  const snapshotId = `network:${record.id}`
  const app: CollectedApp = { id: snapshotId, label: '浏览器响应快照', declaredId: null, serverRendered: null, externalUrl: record.url, sources: [{ kind: 'external', url: record.url, text: body.text, bytes: body.bytes, rawUtf8Bytes: body.bytes, messageBytes: new TextEncoder().encode(JSON.stringify(body.text)).byteLength, fetchedAt: Date.now(), complete: true, transport: 'devtools-response', snapshotId, sourceId: `${snapshotId}:source` }] }
  return { app, snapshot: { snapshotId, pageUrl: current?.pageUrl ?? record.url, initialUrl: null, title: '浏览器响应快照', collectedAt: Date.now(), apps: [app], warnings: ['显式选择的浏览器响应，独立于 DOM／扩展重新获取来源；不自动绑定字段关注。'] } }
}
