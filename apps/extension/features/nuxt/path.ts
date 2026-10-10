export type FieldSegment = { kind: 'property', key: string } | {
  kind: 'index' | 'map-key' | 'map-value' | 'map-entry' | 'set'
  index: number
}
export type FieldPath = FieldSegment[]
export const HOLE = Symbol('数组空洞')

/** 路径只用于展示，不执行页面表达式。 */
export function formatPath(path: FieldPath): string {
  return `$${path.map(segment => segment.kind === 'property' ? `[${JSON.stringify(segment.key)}]` : segment.kind === 'index' ? `[${segment.index}]` : segment.kind === 'set' ? `[set:${segment.index}]` : segment.kind === 'map-entry' ? `[map:${segment.index}]` : `[map:${segment.index}:${segment.kind === 'map-key' ? 'key' : 'value'}]`).join('')}`
}
