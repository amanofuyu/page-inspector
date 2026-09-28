import type { FieldPath, FieldSegment } from '../inspection/model'

export type PatternSegment = FieldSegment | {
  kind: 'property-any' | 'index-any'
}
export function formatPath(path: FieldPath): string {
  return `$${path.map(segment => segment.kind === 'property' ? `[${JSON.stringify(segment.key)}]` : segment.kind === 'index' ? `[${segment.index}]` : segment.kind === 'set' ? `[set:${segment.index}]` : segment.kind === 'map-entry' ? `[map:${segment.index}]` : `[map:${segment.index}:${segment.kind === 'map-key' ? 'key' : 'value'}]`).join('')}`
}
export function segmentKey(segment: PatternSegment): string {
  // 浏览器存储可能重排对象键；路径身份只由段类型及其内容决定。
  return JSON.stringify([segment.kind, segment.kind === 'property' ? segment.key : 'index' in segment ? segment.index : null])
}
/** 只解析路径语法，不执行表达式；数字属性名与数组位置保持不同。 */
export function parsePath(input: string, wildcards = true): PatternSegment[] {
  const text = input.trim()
  if (text.length > 8192)
    throw new Error('路径过长。')
  const path: PatternSegment[] = []
  let offset = text.startsWith('$') ? 1 : 0
  while (offset < text.length) {
    if (path.length >= 100)
      throw new Error('路径最多 100 层。')
    if (text[offset] === '.') {
      offset++
      if (offset === text.length)
        throw new Error('路径不能以点号结束。')
    }
    if (text[offset] === '[') {
      offset++
      if (text[offset] === '"') {
        const start = offset++
        let escaped = false
        while (offset < text.length) {
          const char = text[offset++]
          if (char === '"' && !escaped)
            break
          if (char === '\\' && !escaped)
            escaped = true
          else
            escaped = false
        }
        const key = JSON.parse(text.slice(start, offset))
        if (typeof key !== 'string' || text[offset++] !== ']')
          throw new Error('属性路径格式无效。')
        path.push({ kind: 'property', key })
      }
      else {
        const end = text.indexOf(']', offset)
        if (end < 0)
          throw new Error('路径缺少右方括号。')
        const token = text.slice(offset, end)
        const special = /^(map|set):(\d+)(?::(key|value))?$/.exec(token)
        if (token === '*' && wildcards)
          path.push({ kind: 'index-any' })
        else if (/^(?:0|[1-9]\d*)$/.test(token) && Number.isSafeInteger(Number(token)))
          path.push({ kind: 'index', index: Number(token) })
        else if (special && !(special[1] === 'set' && special[3]) && Number.isSafeInteger(Number(special[2])))
          path.push({ kind: special[1] === 'set' ? 'set' : special[3] === 'key' ? 'map-key' : special[3] === 'value' ? 'map-value' : 'map-entry', index: Number(special[2]) })
        else
          throw new Error('仅支持属性、非负数组位置、*、[*] 和 Map／Set 位置路径。')
        offset = end + 1
      }
    }
    else {
      const start = offset
      while (offset < text.length && !'.['.includes(text[offset]!))
        offset++
      const key = text.slice(start, offset)
      if (key === '*' && wildcards)
        path.push({ kind: 'property-any' })
      else if (key && !/[\s\]*]/.test(key))
        path.push({ kind: 'property', key })
      else
        throw new Error('特殊属性名请使用 ["属性名"]。')
    }
    if (offset < text.length && text[offset] !== '.' && text[offset] !== '[')
      throw new Error('路径段之间缺少分隔符。')
  }
  return path
}
export function exactPath(input: string): FieldPath {
  return parsePath(input, false) as FieldPath
}
export function validFieldPath(value: unknown): value is FieldPath {
  return Array.isArray(value) && value.length <= 100 && value.every(segment => segment && typeof segment === 'object' && (segment.kind === 'property' ? typeof segment.key === 'string' && segment.key.length <= 8192 : ['index', 'map-key', 'map-value', 'map-entry', 'set'].includes(segment.kind) && Number.isSafeInteger(segment.index) && segment.index >= 0))
}
