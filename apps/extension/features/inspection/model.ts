export type FieldSegment = {
  kind: 'property'
  key: string
} | {
  kind: 'index' | 'map-key' | 'map-value' | 'map-entry' | 'set'
  index: number
}
export type FieldPath = FieldSegment[]
export interface Coverage {
  status: 'complete' | 'partial' | 'failed'
  scanned: number
  nodeBudget: number
  depthBudget: number
  timeBudgetMs: number
  reasons: string[]
}
export const INDEX_LIMITS = { nodes: 100000, depth: 100, ms: 2000 }
export const WATCH_BYTES = 2 * 1024 * 1024
export const HOLE = Symbol('数组空洞')
export interface NodeSummary {
  nodeId: number
  fieldPath: FieldPath
  path: string
  key: string
  type: string
  baseType: string
  tags: string[]
  preview: string
  itemCount: number | null
  sourceId: string | null
  referencePath?: string
}
export interface GraphNode extends NodeSummary {
  value: unknown
  children: {
    segment: FieldSegment
    id: number
  }[]
  complete: boolean
  reference?: number
}
export interface PayloadIndex {
  nodes: GraphNode[]
  coverage: Coverage
}
