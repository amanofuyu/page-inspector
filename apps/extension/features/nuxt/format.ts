import type { FieldPath } from '../inspection/model'
import { HOLE } from '../inspection/model'
import { PayloadTag } from './types'

export interface DataNode {
  path: string
  fieldPath?: FieldPath
  key: string
  type: string
  preview: string
  value?: string | number | boolean | null
  reference?: string
  children?: DataNode[]
  truncated?: boolean
}
export interface DataTree {
  root: DataNode
  count: number
  truncated: boolean
}
const hole = HOLE
export function buildTree(input: unknown, maxNodes = 10000, maxDepth = 60, rootPath = '$', rootKey = '$', rootFieldPath: FieldPath = []): DataTree {
  const seen = new WeakMap<object, string>()
  let count = 0
  let truncated = false
  function walk(value: unknown, key: string, path: string, depth: number, fieldPath: FieldPath): DataNode {
    count++
    const node: DataNode = { key, path, fieldPath, type: '', preview: '' }
    let wrapper = ''
    const tags = new Set<PayloadTag>()
    while (value instanceof PayloadTag) {
      if (tags.has(value))
        return { ...node, type: 'Reference', preview: `↗ ${path}`, reference: path }
      tags.add(value)
      wrapper += `${value.type} → `
      value = value.value
    }
    if (value !== null && typeof value === 'object') {
      const reference = seen.get(value)
      if (reference !== undefined)
        return { ...node, type: `${wrapper}Reference`, reference, preview: `↗ ${reference}` }
      seen.set(value, path)
    }
    // 先记录装箱对象的引用身份，再复用标量格式化，保留特殊数值和完整字符串。
    let boxedType = ''
    if (value !== null && typeof value === 'object' && ['[object Number]', '[object String]', '[object Boolean]', '[object BigInt]'].includes(Object.prototype.toString.call(value))) {
      boxedType = `Boxed${value.constructor.name}`
      value = value.valueOf()
    }
    let type: string = typeof value
    let entries: Iterable<[
      string,
      unknown,
    ]> | undefined
    if (value === null) {
      type = 'null'
      node.value = null
    }
    else if (typeof value === 'string' || typeof value === 'boolean') {
      node.value = value
    }
    else if (typeof value === 'number') {
      node.value = Object.is(value, -0) ? '-0' : Number.isFinite(value) ? value : String(value)
    }
    else if (typeof value === 'bigint') {
      node.value = value.toString()
    }
    else if (value instanceof Date) {
      type = 'Date'
      node.value = Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString()
    }
    else if (value instanceof RegExp || value instanceof URL || value instanceof URLSearchParams) {
      type = value.constructor.name
      node.value = value.toString()
    }
    else if (value instanceof Map) {
      type = 'Map'
      node.preview = `${value.size} 项`
      entries = (function* () {
        let index = 0
        for (const [entryKey, entryValue] of value) {
          yield [String(index++), { key: entryKey, value: entryValue }] as [
            string,
            unknown,
          ]
        }
      })()
    }
    else if (value instanceof Set) {
      type = 'Set'
      node.preview = `${value.size} 项`
      entries = (function* () {
        let index = 0
        for (const item of value) {
          yield [String(index++), item] as [
            string,
            unknown,
          ]
        }
      })()
    }
    else if (Array.isArray(value)) {
      type = 'Array'
      node.preview = `${value.length} 项`
      entries = (function* () {
        for (let index = 0; index < value.length; index++) {
          yield [String(index), index in value ? value[index] : hole] as [
            string,
            unknown,
          ]
        }
      })()
    }
    else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      type = value.constructor.name
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      node.preview = `${bytes.length} 字节（按字节展示）`
      entries = (function* () {
        for (let index = 0; index < bytes.length; index++) {
          yield [String(index), bytes[index]] as [
            string,
            unknown,
          ]
        }
      })()
    }
    else if (value !== null && typeof value === 'object') {
      type = Object.getPrototypeOf(value) === null ? 'Object(null)' : 'Object'
      const keys = Object.keys(value)
      node.preview = `${keys.length} 个字段`
      entries = (function* () {
        for (const entryKey of keys) {
          yield [entryKey, (value as Record<string, unknown>)[entryKey]] as [
            string,
            unknown,
          ]
        }
      })()
    }
    else if (value === hole) {
      type = 'empty'
    }
    node.type = wrapper + (boxedType || type)
    if (entries) {
      node.children = []
      for (const [entryKey, entryValue] of entries) {
        if (count >= maxNodes || depth >= maxDepth) {
          node.truncated = true
          truncated = true
          break
        }
        const parent = fieldPath.at(-1)
        const childPath: FieldPath = parent?.kind === 'map-entry' ? [...fieldPath.slice(0, -1), { kind: entryKey === 'key' ? 'map-key' : 'map-value', index: parent.index }] : [...fieldPath, type === 'Map' ? { kind: 'map-entry', index: Number(entryKey) } : type === 'Set' ? { kind: 'set', index: Number(entryKey) } : Array.isArray(value) || value instanceof ArrayBuffer || ArrayBuffer.isView(value) ? { kind: 'index', index: Number(entryKey) } : { kind: 'property', key: entryKey }]
        node.children.push(walk(entryValue, entryKey, `${path}[${JSON.stringify(entryKey)}]`, depth + 1, childPath))
      }
    }
    else {
      const full = typeof value === 'string' ? JSON.stringify(value) : type === 'bigint' ? `${node.value}n` : String(node.value ?? type)
      node.preview = full.length > 300 ? `${full.slice(0, 300)}…` : full
    }
    return node
  }
  const root = walk(input, rootKey, rootPath, 0, rootFieldPath)
  return { root, count, truncated }
}
/** 导出显式类型的查看器格式，避免将特殊值伪装成普通 JSON。 */
export function exportNode(node: DataNode): string {
  return JSON.stringify({ format: 'page-inspector/v1', node }, null, 2)
}
export function searchTree(root: DataNode, query: string, limit = 100): {
  matches: DataNode[]
  limited: boolean
} {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle)
    return { matches: [], limited: false }
  const matches: DataNode[] = []
  const stack = [root]
  while (stack.length) {
    const node = stack.pop()!
    if ([node.key, node.type, node.value ?? node.preview].some(value => String(value).toLocaleLowerCase().includes(needle))) {
      if (matches.length === limit)
        return { matches, limited: true }
      matches.push(node)
    }
    if (node.children)
      stack.push(...[...node.children].reverse())
  }
  return { matches, limited: false }
}

/** 每个分类独立分配展示预算，避免大 data 隐藏 state 等后续字段。 */
export function buildPayloadView(payload: Record<string, unknown>, view: string): DataTree | null {
  if (view === 'raw')
    return null
  if (view === 'all')
    return buildTree(payload)
  if (view === 'meta') {
    const tree = buildTree(Object.fromEntries(Object.entries(payload).filter(([key]) => !['data', 'state', '_errors'].includes(key))))
    // 元信息根是聚合视图，不对应应用中的一个真实字段。
    tree.root.fieldPath = undefined
    return tree
  }
  if (!Object.hasOwn(payload, view))
    return null
  return buildTree(payload[view], 10000, 60, `$[${JSON.stringify(view)}]`, view, [{ kind: 'property', key: view }])
}
