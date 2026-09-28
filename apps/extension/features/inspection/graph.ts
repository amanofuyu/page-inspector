import type { FieldPath, FieldSegment, GraphNode, NodeSummary, PayloadIndex } from './model'
import { PayloadTag } from '../nuxt/types'
import { formatPath, segmentKey } from '../query/path'
import { HOLE, INDEX_LIMITS } from './model'

export function describe(input: unknown) {
  const tags: string[] = []
  const seen = new Set<PayloadTag>()
  let value = input
  let unsupported = false
  while (value instanceof PayloadTag && !seen.has(value)) {
    seen.add(value)
    tags.push(value.type)
    unsupported ||= value.unsupported
    value = value.value
  }
  let baseType: string = typeof value
  let preview = ''
  let itemCount: number | null = null
  if (value === HOLE) {
    baseType = 'empty'
    preview = '数组空洞'
  }
  else if (value === null) {
    baseType = 'null'
    preview = 'null'
  }
  else if (Array.isArray(value)) {
    baseType = 'Array'
    itemCount = value.length
  }
  else if (value instanceof Map) {
    baseType = 'Map'
    itemCount = value.size
  }
  else if (value instanceof Set) {
    baseType = 'Set'
    itemCount = value.size
  }
  else if (value !== null && typeof value === 'object' && ['[object Number]', '[object String]', '[object Boolean]', '[object BigInt]'].includes(Object.prototype.toString.call(value))) {
    baseType = `Boxed${value.constructor.name}`
    preview = String(value.valueOf())
  }
  else if (value instanceof Date) {
    baseType = 'Date'
    preview = Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString()
  }
  else if (value instanceof RegExp || value instanceof URL || value instanceof URLSearchParams) {
    baseType = value.constructor.name
    preview = value.toString()
  }
  else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    baseType = value.constructor.name
    itemCount = value.byteLength
  }
  else if (value && typeof value === 'object') {
    baseType = Object.getPrototypeOf(value) === null ? 'Object(null)' : 'Object'
    itemCount = Object.keys(value).length
  }
  else if (typeof value === 'string') {
    preview = JSON.stringify(value.slice(0, 240))
    if (value.length > 240)
      preview += '…'
  }
  else if (typeof value === 'bigint') {
    preview = `${value}n`
  }
  else if (typeof value === 'number' && Object.is(value, -0)) {
    preview = '-0'
  }
  else {
    preview = String(value)
  }
  if (itemCount !== null)
    preview = `${itemCount} ${baseType.startsWith('Object') ? '个字段' : '项'}`
  return { value, tags, baseType, type: [...tags, baseType].join(' → '), preview: preview.slice(0, 320), itemCount, unsupported }
}
export function* children(value: unknown): Generator<{
  segment: FieldSegment
  key: string
  value: unknown
}> {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++)
      yield { segment: { kind: 'index', index }, key: String(index), value: Object.hasOwn(value, index) ? value[index] : HOLE }
  }
  else if (value instanceof Map) {
    let index = 0
    for (const [key, entry] of value) {
      yield { segment: { kind: 'map-key', index }, key: `键 ${index}`, value: key }
      yield { segment: { kind: 'map-value', index }, key: `值 ${index++}`, value: entry }
    }
  }
  else if (value instanceof Set) {
    let index = 0
    for (const entry of value) {
      yield { segment: { kind: 'set', index }, key: String(index), value: entry }
      index++
    }
  }
  else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    for (let index = 0; index < bytes.length; index++)
      yield { segment: { kind: 'index', index }, key: String(index), value: bytes[index] }
  }
  else if (value && typeof value === 'object' && !(value instanceof Date || value instanceof RegExp || value instanceof URL || value instanceof URLSearchParams)) {
    for (const key of Object.keys(value))
      yield { segment: { kind: 'property', key }, key, value: (value as Record<string, unknown>)[key] }
  }
}
export async function buildIndex(value: unknown, sources: Record<string, string[]> = {}, limits = INDEX_LIMITS, cancelled = () => false): Promise<PayloadIndex> {
  const index: PayloadIndex = { nodes: [], coverage: { status: 'complete', scanned: 0, nodeBudget: limits.nodes, depthBudget: limits.depth, timeBudgetMs: limits.ms, reasons: [] } }
  const seen = new WeakMap<object, number>()
  const frames: {
    node: GraphNode
    entries: ReturnType<typeof children>
  }[] = []
  const started = performance.now()
  function reason(text: string) {
    index.coverage.status = 'partial'
    if (!index.coverage.reasons.includes(text))
      index.coverage.reasons.push(text)
  }
  function add(input: unknown, path: FieldPath, key: string): GraphNode {
    const info = describe(input)
    const first = path[0]
    const node: GraphNode = { ...info, nodeId: index.nodes.length, fieldPath: path, path: formatPath(path), key, sourceId: first?.kind === 'property' && Object.hasOwn(sources, first.key) ? sources[first.key]?.at(-1) ?? null : null, children: [], complete: true }
    index.nodes.push(node)
    if (info.value && typeof info.value === 'object') {
      const previous = seen.get(info.value)
      if (previous !== undefined) {
        node.reference = previous
        node.referencePath = index.nodes[previous]!.path
        return node
      }
      seen.set(info.value, node.nodeId)
    }
    if (info.itemCount !== null && info.itemCount > 0) {
      if (path.length >= limits.depth) {
        node.complete = false
        reason('达到索引深度预算')
      }
      else {
        frames.push({ node, entries: children(info.value) })
      }
    }
    return node
  }
  add(value, [], '$')
  while (frames.length) {
    if (cancelled() || performance.now() - started >= limits.ms || index.nodes.length >= limits.nodes) {
      reason(cancelled() ? '任务已取消' : index.nodes.length >= limits.nodes ? '达到索引节点预算' : '达到索引时间预算')
      for (const frame of frames)
        frame.node.complete = false
      break
    }
    const frame = frames.at(-1)!
    const next = frame.entries.next()
    if (next.done) {
      frames.pop()
      continue
    }
    const child = add(next.value.value, [...frame.node.fieldPath, next.value.segment], next.value.key)
    frame.node.children.push({ segment: next.value.segment, id: child.nodeId })
    if (index.nodes.length % 512 === 0)
      await new Promise(resolve => setTimeout(resolve, 0))
  }
  index.coverage.scanned = index.nodes.length
  return index
}
export function entity(index: PayloadIndex, node: GraphNode): GraphNode {
  return node.reference === undefined ? node : index.nodes[node.reference]!
}
export function resolvePath(index: PayloadIndex, path: FieldPath): {
  node?: GraphNode
  known: boolean
} {
  let node = index.nodes[0]
  for (const segment of path) {
    if (!node)
      return { known: false }
    node = entity(index, node)
    const edge = node.children.find(item => segmentKey(item.segment) === segmentKey(segment))
    if (!edge)
      return { known: node.complete }
    node = index.nodes[edge.id]
  }
  return { node, known: !!node }
}
export function summary(node: GraphNode, path = node.fieldPath): NodeSummary {
  return { nodeId: node.nodeId, fieldPath: path, path: formatPath(path), key: node.key, type: node.type, baseType: node.baseType, tags: node.tags, preview: node.preview, itemCount: node.itemCount, sourceId: node.sourceId, referencePath: node.referencePath }
}
