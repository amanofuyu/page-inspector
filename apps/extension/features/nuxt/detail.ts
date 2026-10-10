import type { DataNode, DataTree } from './format'
import type { FieldPath } from './path'
import type { ParsedApp } from './types'
import { buildTree } from './format'
import { HOLE } from './path'
import { unwrap } from './types'

export interface FieldDetail {
  tree: DataTree | null
  sourceIds: string[]
}

/** 直接访问已解码数据；保留 undefined、数组空洞及特殊集合的路径语义。 */
export function resolveValue(root: unknown, path: FieldPath): { found: boolean, value?: unknown } {
  let value = root
  for (const segment of path) {
    const current = unwrap(value)
    if (segment.kind === 'property') {
      if (current === null || typeof current !== 'object' || !Object.hasOwn(current, segment.key))
        return { found: false }
      value = (current as Record<string, unknown>)[segment.key]
    }
    else if (segment.kind === 'index') {
      if (!Number.isSafeInteger(segment.index))
        return { found: false }
      if (Array.isArray(current)) {
        if (segment.index < 0 || segment.index >= current.length)
          return { found: false }
        value = segment.index in current ? current[segment.index] : HOLE
      }
      else if (current instanceof ArrayBuffer || ArrayBuffer.isView(current)) {
        const bytes = current instanceof ArrayBuffer ? new Uint8Array(current) : new Uint8Array(current.buffer, current.byteOffset, current.byteLength)
        if (segment.index < 0 || segment.index >= bytes.length)
          return { found: false }
        value = bytes[segment.index]
      }
      else {
        return { found: false }
      }
    }
    else {
      const collection = segment.kind === 'set' ? current instanceof Set ? current : null : current instanceof Map ? current : null
      if (!collection || !Number.isSafeInteger(segment.index) || segment.index < 0 || segment.index >= collection.size)
        return { found: false }
      let index = 0
      for (const item of collection) {
        if (index++ !== segment.index)
          continue
        value = segment.kind === 'set' ? item : segment.kind === 'map-entry' ? { key: item[0], value: item[1] } : item[segment.kind === 'map-key' ? 0 : 1]
        break
      }
    }
  }
  return { found: true, value }
}

/** 仅为当前选中字段构建局部树，避免建立全量分析索引。 */
export function fieldDetail(parsed: ParsedApp, node: DataNode): FieldDetail | null {
  if (!parsed.payload || !node.fieldPath)
    return null
  const resolved = resolveValue(parsed.payload, node.fieldPath)
  const top = node.fieldPath[0]
  return {
    tree: resolved.found ? buildTree(resolved.value, 10000, 60, node.path, node.key, node.fieldPath) : null,
    sourceIds: top?.kind === 'property' ? parsed.fieldSources[top.key] ?? [] : [],
  }
}
