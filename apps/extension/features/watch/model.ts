import type { FieldPath, PayloadIndex } from '../inspection/model'
import type { CollectedApp, PageSnapshot } from '../nuxt/types'
import type { QuerySpec } from '../query/engine'
import { encodeStructure } from '../analysis/estimate'
import { nodeInput } from '../analysis/report'
import { resolvePath } from '../inspection/graph'
import { HOLE, WATCH_BYTES } from '../inspection/model'
import { validateQuery } from '../query/engine'
import { validFieldPath } from '../query/path'

export interface Scope {
  origin: string
  pathname: string
  app: string
  query: string | null
}
interface DefinitionBase {
  version: 1
  id: string
  name: string
  scope: Scope
  createdAt: number
}
export interface WatchRule extends DefinitionBase {
  kind: 'watch'
  path: FieldPath
}
export interface SavedQuery extends DefinitionBase {
  kind: 'query'
  query: QuerySpec
}
export type Definition = WatchRule | SavedQuery
export const DEFINITION_PREFIX = 'inspector-definition/v1/'
export function scopeFor(snapshot: PageSnapshot | null | undefined, app: CollectedApp | undefined, includeQuery = false): Scope | null {
  if (!snapshot?.initialUrl || !app?.declaredId || snapshot.apps.filter(item => item.declaredId === app.declaredId).length !== 1)
    return null
  try {
    const url = new URL(snapshot.initialUrl)
    if (!['http:', 'https:'].includes(url.protocol))
      return null
    return { origin: url.origin, pathname: url.pathname, app: app.declaredId, query: includeQuery ? url.search : null }
  }
  catch {
    return null
  }
}
export function matchesScope(rule: Scope, current: Scope | null) {
  return !!current && rule.origin === current.origin && rule.pathname === current.pathname && rule.app === current.app && (rule.query === null || rule.query === current.query)
}
export function validDefinition(value: unknown): value is Definition {
  if (!value || typeof value !== 'object')
    return false
  const item = value as Definition
  const scope = item.scope
  return item.version === 1 && typeof item.id === 'string' && /^[\w-]{1,80}$/.test(item.id) && typeof item.name === 'string' && item.name.length <= 160 && Number.isFinite(item.createdAt) && !!scope && ['origin', 'pathname', 'app'].every(key => typeof scope[key as keyof Scope] === 'string' && String(scope[key as keyof Scope]).length <= 8192) && (scope.query === null || (typeof scope.query === 'string' && scope.query.length <= 8192)) && (item.kind === 'watch' ? validFieldPath(item.path) : item.kind === 'query' && validateQuery(item.query))
}
export interface WatchValue {
  id: string
  presence: 'found' | 'missing' | 'unknown'
  type: string
  preview: string
  canonical: string | null
  bytes: number
  reason?: string
}
export interface WatchComparison {
  id: string
  status: '首次出现' | '未变化' | '值变化' | '类型变化' | '缺失' | '无法确认'
  current: WatchValue
  previous?: Pick<WatchValue, 'preview' | 'type' | 'presence'>
}
/** 一次最多保留一半预算；另一半留给前一快照，跨规则合计不超过 2 MiB。 */
export function evaluateWatches(index: PayloadIndex, rules: WatchRule[], parsedComplete: boolean): WatchValue[] {
  let remaining = WATCH_BYTES / 2
  const deadline = performance.now() + 2000
  return rules.map((rule, position) => {
    const resolved = resolvePath(index, rule.path)
    const unknown: WatchValue = { id: rule.id, presence: 'unknown', type: 'unknown', preview: '无法确认', canonical: null, bytes: 0 }
    if (position >= 50)
      return { ...unknown, reason: '当前范围叠加的关注超过 50 项，本项未比较。' }
    if (!parsedComplete || !resolved.known)
      return { ...unknown, reason: '快照解析或路径扫描未完成，保留上次基线。' }
    if ((!resolved.node || resolved.node.value === HOLE) && index.coverage.status !== 'complete')
      return { ...unknown, reason: '索引覆盖不完整，不能将字段解释为删除。' }
    if (!resolved.node || resolved.node.value === HOLE)
      return { id: rule.id, presence: 'missing', type: 'missing', preview: '字段缺失', canonical: 'missing', bytes: 0 }
    const node = resolved.node
    const encoded = encodeStructure(nodeInput(node), { capture: true, maxBytes: remaining, deadline })
    if (encoded.canonical === null)
      return { ...unknown, type: node.type, preview: node.preview, reason: encoded.coverage.reasons.join('；') }
    remaining -= encoded.bytes
    return { id: rule.id, presence: 'found', type: node.type, preview: node.preview, canonical: encoded.canonical, bytes: encoded.bytes }
  })
}
export function compareWatch(current: WatchValue, previous?: WatchValue): WatchComparison {
  const status = current.presence === 'unknown' ? '无法确认' : current.presence === 'missing' ? '缺失' : !previous ? '首次出现' : previous.presence === 'missing' ? '首次出现' : current.type !== previous.type ? '类型变化' : current.canonical === previous.canonical ? '未变化' : '值变化'
  return { id: current.id, status, current, previous: previous && { preview: previous.preview, type: previous.type, presence: previous.presence } }
}
/** 会话只保留最近一次有效基线；未知结果不污染基线。 */
export class WatchSession {
  private scope = ''
  private values = new Map<string, WatchValue>()
  private snapshots = new Map<string, string>()
  private comparisons = new Map<string, WatchComparison>()
  reset(scope: string) {
    if (scope === this.scope)
      return
    this.scope = scope
    this.values.clear()
    this.snapshots.clear()
    this.comparisons.clear()
  }

  update(snapshot: string, values: WatchValue[]) {
    const active = new Set(values.map(value => value.id))
    for (const id of this.values.keys()) {
      if (!active.has(id)) {
        this.values.delete(id)
        this.snapshots.delete(id)
        this.comparisons.delete(id)
      }
    }
    return values.map((current) => {
      if (this.snapshots.get(current.id) === snapshot)
        return this.comparisons.get(current.id)!
      const previous = this.values.get(current.id)
      const retainedBytes = [...this.values.values()].reduce((total, value) => total + value.bytes, 0) - (previous?.bytes ?? 0)
      if (current.presence === 'found' && retainedBytes + current.bytes > WATCH_BYTES / 2)
        current = { ...current, presence: 'unknown', canonical: null, bytes: 0, reason: '会话基线达到总缓存预算，保留旧值。' }
      const comparison = compareWatch(current, previous)
      this.comparisons.set(current.id, comparison)
      if (current.presence !== 'unknown') {
        this.values.set(current.id, current)
        this.snapshots.set(current.id, snapshot)
      }
      return comparison
    })
  }
}
