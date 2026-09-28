import type { analyzeIndex, sourceMetrics } from '../features/analysis/report'
import type { Coverage, FieldPath } from '../features/inspection/model'
import type { DataTree } from '../features/nuxt/format'
import type { CollectedApp } from '../features/nuxt/types'
import type { QueryResult, QuerySpec } from '../features/query/engine'
import type { WatchRule, WatchValue } from '../features/watch/model'

export interface IndexReady {
  coverage: Coverage
  metrics: Awaited<ReturnType<typeof sourceMetrics>>
  fieldSources: Record<string, string[]>
  parsedComplete: boolean
}
export interface FieldDetail {
  tree: DataTree | null
  known: boolean
  sourceIds: string[]
  path: FieldPath
}
export interface WorkerOperations {
  init: {
    input: {
      app: CollectedApp
      source: number | null
    }
    output: IndexReady
  }
  analyze: {
    input: undefined
    output: Awaited<ReturnType<typeof analyzeIndex>>
  }
  query: {
    input: QuerySpec
    output: QueryResult
  }
  page: {
    input: number
    output: QueryResult
  }
  detail: {
    input: FieldPath
    output: FieldDetail
  }
  watches: {
    input: WatchRule[]
    output: WatchValue[]
  }
}
export type Operation = keyof WorkerOperations
export type WorkerRequest = {
  [K in Operation]: {
    id: number
    snapshot: string
    operation: K
    input: WorkerOperations[K]['input']
  };
}[Operation]
