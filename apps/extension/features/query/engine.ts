import type { Coverage, FieldPath, GraphNode, NodeSummary, PayloadIndex } from '../inspection/model'
import type { PatternSegment } from './path'
import { entity, summary } from '../inspection/graph'
import { HOLE } from '../inspection/model'
import { formatPath, parsePath, segmentKey } from './path'

export interface QueryCondition {
  field: 'key' | 'path' | 'type' | 'tag' | 'value'
  op: 'contains' | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'missing'
  value: string
  valueType?: 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'bigint' | 'empty'
}
export interface QuerySpec {
  combine: 'all' | 'any'
  category: 'app' | 'data' | 'state' | '_errors' | 'meta'
  conditions: QueryCondition[]
}
export interface QueryMatch extends NodeSummary {
  reasons: string[]
  missing?: boolean
  uncertain?: boolean
}
export interface QueryResult {
  matches: QueryMatch[]
  total: number
  limited: boolean
  coverage: Coverage
  offset: number
}
export function validateQuery(value: unknown): value is QuerySpec {
  if (!value || typeof value !== 'object')
    return false
  const query = value as QuerySpec
  return ['all', 'any'].includes(query.combine) && ['app', 'data', 'state', '_errors', 'meta'].includes(query.category) && Array.isArray(query.conditions) && query.conditions.length <= 10 && query.conditions.every(condition => condition && ['key', 'path', 'type', 'tag', 'value'].includes(condition.field) && ['contains', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'exists', 'missing'].includes(condition.op) && (condition.field === 'path' ? ['eq', 'ne', 'exists', 'missing'].includes(condition.op) : condition.field === 'value' ? !['exists', 'missing'].includes(condition.op) : ['eq', 'ne', 'contains'].includes(condition.op)) && typeof condition.value === 'string' && condition.value.length <= 8192 && (condition.valueType === undefined || ['string', 'number', 'boolean', 'null', 'undefined', 'bigint', 'empty'].includes(condition.valueType)))
}
function literal(condition: QueryCondition): unknown {
  const value = condition.value
  switch (condition.valueType) {
    case 'number':
      if (!/^(?:-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|NaN|-?Infinity)$/i.test(value))
        throw new Error('请输入明确的数字，字符串不会自动转换。')
      return /^nan$/i.test(value) ? Number.NaN : /^-?infinity$/i.test(value) ? value.startsWith('-') ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY : Number(value)
    case 'bigint':
      if (!/^-?\d+$/.test(value) || value.length > 1000)
        throw new Error('BigInt 条件无效。')
      return BigInt(value)
    case 'boolean':
      if (!['true', 'false'].includes(value))
        throw new Error('布尔值必须为 true 或 false。')
      return value === 'true'
    case 'null': return null
    case 'undefined': return undefined
    case 'empty': return HOLE
    default: return value
  }
}
function matchesSegment(pattern: PatternSegment, actual: PatternSegment) {
  return pattern.kind === 'property-any' ? actual.kind === 'property' : pattern.kind === 'index-any' ? actual.kind === 'index' : segmentKey(pattern) === segmentKey(actual)
}
export function resolvePattern(index: PayloadIndex, pattern: PatternSegment[], deadline = performance.now() + 2000) {
  let frontier = [{ node: index.nodes[0]!, path: [] as FieldPath }]
  const missing: {
    path: FieldPath
    known: boolean
  }[] = []
  let partial = false
  let operations = 0
  for (let depth = 0; depth < pattern.length; depth++) {
    const part = pattern[depth]!
    const next: typeof frontier = []
    for (const current of frontier) {
      const node = entity(index, current.node)
      let found = false
      for (const edge of node.children) {
        if (++operations > 100000 || performance.now() > deadline) {
          partial = true
          break
        }
        if (!matchesSegment(part, edge.segment))
          continue
        found = true
        const path = [...current.path, edge.segment]
        const child = index.nodes[edge.id]!
        if (child.value === HOLE) {
          const rest = pattern.slice(depth + 1)
          if (rest.every(segment => !['property-any', 'index-any'].includes(segment.kind)))
            missing.push({ path: [...path, ...rest as FieldPath], known: true })
        }
        else {
          next.push({ node: child, path })
        }
      }
      if (!node.complete)
        partial = true
      if (!found && !['property-any', 'index-any'].includes(part.kind)) {
        const rest = pattern.slice(depth)
        if (rest.every(segment => !['property-any', 'index-any'].includes(segment.kind)))
          missing.push({ path: [...current.path, ...rest as FieldPath], known: node.complete })
      }
      if (partial && (operations > 100000 || performance.now() > deadline))
        break
    }
    frontier = next
    if (operations > 100000 || performance.now() > deadline)
      break
  }
  return { found: frontier, missing, partial }
}
function inCategory(path: FieldPath, category: QuerySpec['category']) {
  if (category === 'app')
    return true
  const first = path[0]
  if (!first || first.kind !== 'property')
    return false
  return category === 'meta' ? !['data', 'state', '_errors'].includes(first.key) : first.key === category
}
export async function queryIndex(index: PayloadIndex, query: QuerySpec, cancelled = () => false) {
  if (!validateQuery(query))
    throw new Error('查询条件无效。')
  const deadline = performance.now() + 2000
  const matches: QueryMatch[] = []
  const conditions = query.conditions.map(condition => ({ ...condition, expected: condition.field === 'value' ? literal(condition) : condition.value, pattern: condition.field === 'path' ? parsePath(condition.value) : null }))
  const candidates = new Map<string, {
    node?: GraphNode
    path: FieldPath
    missing?: boolean
    known: boolean
  }>()
  let partial = index.coverage.status !== 'complete'
  for (const node of index.nodes) {
    if (inCategory(node.fieldPath, query.category))
      candidates.set(node.path, { node, path: node.fieldPath, known: true })
  }
  for (const condition of conditions) {
    if (!condition.pattern)
      continue
    const rooted = condition.value.startsWith('$') || query.category === 'app' || query.category === 'meta' ? condition.pattern : [{ kind: 'property' as const, key: query.category }, ...condition.pattern]
    condition.pattern = rooted
    const resolved = resolvePattern(index, rooted, deadline)
    partial ||= resolved.partial
    for (const item of resolved.found) {
      if (inCategory(item.path, query.category))
        candidates.set(formatPath(item.path), { ...item, known: true })
    }
    if (condition.op === 'missing') {
      for (const item of resolved.missing) {
        if (inCategory(item.path, query.category))
          candidates.set(formatPath(item.path), { ...item, known: item.known && index.coverage.status === 'complete', missing: true })
      }
    }
  }
  let visited = 0
  let limited = false
  for (const candidate of candidates.values()) {
    if (++visited % 256 === 0)
      await new Promise(resolve => setTimeout(resolve, 0))
    if (cancelled() || performance.now() > deadline) {
      partial = true
      break
    }
    const results = conditions.map((condition) => {
      const node = candidate.node
      if (condition.field === 'path') {
        const pathMatch = condition.pattern!.length === candidate.path.length && condition.pattern!.every((segment, i) => matchesSegment(segment, candidate.path[i]!))
        if (condition.op === 'missing')
          return pathMatch && !!candidate.missing
        if (condition.op === 'ne')
          return !pathMatch
        return pathMatch && !candidate.missing && node?.value !== HOLE
      }
      if (!node || candidate.missing)
        return false
      const actual = condition.field === 'key'
        ? candidate.path.at(-1)?.kind === 'property'
          ? (candidate.path.at(-1) as {
              key: string
            }).key
          : node.key
        : condition.field === 'type' ? node.baseType : condition.field === 'tag' ? node.tags : node.value
      if (condition.op === 'exists')
        return true
      if (condition.op === 'missing')
        return false
      if (condition.field === 'tag') {
        const includes = node.tags.includes(condition.value)
        return condition.op === 'ne' ? !includes : includes
      }
      if (condition.op === 'contains')
        return typeof actual === 'string' && typeof condition.expected === 'string' && actual.toLocaleLowerCase().includes(condition.expected.toLocaleLowerCase())
      if (condition.op === 'eq')
        return Object.is(actual, condition.expected)
      if (condition.op === 'ne')
        return !Object.is(actual, condition.expected)
      if (typeof actual !== 'number' || typeof condition.expected !== 'number' || Number.isNaN(actual) || Number.isNaN(condition.expected))
        return false
      return condition.op === 'gt' ? actual > condition.expected : condition.op === 'gte' ? actual >= condition.expected : condition.op === 'lt' ? actual < condition.expected : actual <= condition.expected
    })
    if (!(query.combine === 'all' ? results.every(Boolean) : results.some(Boolean)))
      continue
    if (matches.length >= 1000) {
      limited = true
      break
    }
    const base = candidate.node ? summary(candidate.node, candidate.path) : { nodeId: -1, fieldPath: candidate.path, path: formatPath(candidate.path), key: '', type: candidate.known ? 'missing' : 'unknown', baseType: candidate.known ? 'missing' : 'unknown', tags: [], preview: candidate.known ? '字段缺失' : '扫描不完整，无法确认', itemCount: null, sourceId: null }
    matches.push({ ...base, missing: candidate.missing, uncertain: !candidate.known, reasons: conditions.filter((_, i) => results[i]).map(condition => `${condition.field} ${condition.op} ${condition.value}`) })
  }
  return { matches, total: matches.length, limited, coverage: { ...index.coverage, status: partial ? 'partial' as const : 'complete' as const, reasons: [...index.coverage.reasons, ...(cancelled() ? ['查询已取消'] : performance.now() > deadline ? ['查询达到时间预算'] : [])], scanned: visited } }
}
