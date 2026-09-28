import type { Coverage } from '../inspection/model'
import { children, describe } from '../inspection/graph'
import { INDEX_LIMITS } from '../inspection/model'

export const ESTIMATE_ALGORITHM = 'typed-structure/v1'
/** 类型标记、JSON 字面量、键名及局部引用编号构成估算口径，不代表网络字节。 */
export function encodeStructure(input: unknown, options: {
  maxBytes?: number
  maxNodes?: number
  maxDepth?: number
  deadline?: number
  capture?: boolean
} = {}) {
  const maxBytes = options.maxBytes ?? Number.POSITIVE_INFINITY
  const maxNodes = options.maxNodes ?? INDEX_LIMITS.nodes
  const maxDepth = options.maxDepth ?? INDEX_LIMITS.depth
  const deadline = options.deadline ?? performance.now() + INDEX_LIMITS.ms
  const encoder = new TextEncoder()
  const seen = new WeakMap<object, number>()
  const chunks: string[] = []
  let bytes = 0
  let nodes = 0
  let references = 0
  let objects = 0
  let complete = true
  let reason = ''
  function emit(value: string) {
    if (value.length > maxBytes - bytes)
      throw new Error('达到内容缓存预算')
    bytes += encoder.encode(value).byteLength
    if (bytes > maxBytes)
      throw new Error('达到内容缓存预算')
    if (options.capture)
      chunks.push(value)
  }
  function walk(raw: unknown, depth: number) {
    if (++nodes > maxNodes || depth > maxDepth || performance.now() > deadline)
      throw new Error('达到结构估算／比较预算')
    const info = describe(raw)
    const value = info.value
    if (info.tags.length)
      emit(`["tags",${JSON.stringify(info.tags)},`)
    if (value && typeof value === 'object') {
      const ref = seen.get(value)
      if (ref !== undefined) {
        references++
        emit(`["ref",${ref}]`)
      }
      else {
        const id = objects++
        seen.set(value, id)
        emit(`[${JSON.stringify(info.baseType)},${id},`)
        if (info.baseType.startsWith('Boxed')) {
          walk(value.valueOf(), depth + 1)
        }
        else if (info.itemCount === null) {
          emit(JSON.stringify(value instanceof Date ? Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString() : String(value)))
        }
        else {
          emit('[')
          let first = true
          const entries = info.baseType === 'Object' || info.baseType === 'Object(null)'
            ? (function* () {
                for (const key of Object.keys(value).sort())
                  yield { key, value: (value as Record<string, unknown>)[key] }
              })()
            : children(value)
          for (const entry of entries) {
            if (!first)
              emit(',')
            first = false
            emit(`[${JSON.stringify(entry.key)},`)
            walk(entry.value, depth + 1)
            emit(']')
          }
          emit(']')
        }
        emit(']')
      }
    }
    else {
      if (typeof value === 'string' && value.length > maxBytes - bytes)
        throw new Error('达到内容缓存预算')
      const literal = typeof value === 'string' || typeof value === 'boolean' ? value : info.baseType === 'number' ? Object.is(value, -0) ? '-0' : String(value) : info.baseType === 'bigint' ? String(value) : info.baseType
      emit(`[${JSON.stringify(info.baseType)},${JSON.stringify(literal)}]`)
    }
    if (info.tags.length)
      emit(']')
  }
  try {
    walk(input, 0)
  }
  catch (error) {
    complete = false
    reason = String(error instanceof Error ? error.message : error)
  }
  const coverage: Coverage = { status: complete ? 'complete' : 'partial', scanned: Math.min(nodes, maxNodes), nodeBudget: maxNodes, depthBudget: maxDepth, timeBudgetMs: INDEX_LIMITS.ms, reasons: reason ? [reason] : [] }
  return { bytes, references, coverage, canonical: options.capture && complete ? chunks.join('') : null }
}
