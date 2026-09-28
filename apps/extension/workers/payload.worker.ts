import type { PayloadIndex } from '../features/inspection/model'
import type { ParsedApp } from '../features/nuxt/types'
import type { QueryResult } from '../features/query/engine'
import type { WorkerRequest } from './protocol'
import { analyzeIndex, nodeInput, sourceMetrics } from '../features/analysis/report'
import { buildIndex, resolvePath } from '../features/inspection/graph'
import { buildTree } from '../features/nuxt/format'
import { parseApp } from '../features/nuxt/parse'
import { queryIndex } from '../features/query/engine'
import { formatPath } from '../features/query/path'
import { evaluateWatches } from '../features/watch/model'

let index: PayloadIndex | null = null
let parsed: ParsedApp | null = null
let snapshot = ''
let query: QueryResult | null = null
let complete = false
let sequence = Promise.resolve()
function page(offset: number): QueryResult {
  if (!query)
    throw new Error('请先执行查询。')
  const start = Math.max(0, Math.min(950, Math.trunc(offset / 50) * 50))
  return { ...query, offset: start, matches: query.matches.slice(start, start + 50) }
}
async function handle(request: WorkerRequest): Promise<unknown> {
  if (request.operation === 'init') {
    snapshot = request.snapshot
    const original = parseApp(request.input.app)
    parsed = request.input.source === null ? original : parseApp({ ...request.input.app, externalUrl: null, sources: request.input.app.sources.filter((_, i) => i === request.input.source) })
    if (!parsed.payload)
      throw new Error(parsed.diagnostics.join('；') || '没有可分析的数据。')
    complete = parsed.status === 'ready' && parsed.sources.every(source => source.status === 'ready')
    index = await buildIndex(parsed.payload, parsed.fieldSources)
    if (!complete) {
      index.coverage.status = 'partial'
      index.coverage.reasons.push('来源解析不完整，缺失与比较结果可能无法确认')
    }
    return { coverage: index.coverage, metrics: await sourceMetrics(request.input.app, original), fieldSources: parsed.fieldSources, parsedComplete: complete }
  }
  if (!index || !parsed || snapshot !== request.snapshot)
    throw new Error('快照已失效，请重新建立索引。')
  switch (request.operation) {
    case 'analyze': return analyzeIndex(index)
    case 'query': {
      query = { ...await queryIndex(index, request.input), offset: 0 }
      // 别名的后代仍继承该路径顶层字段的来源，而非共享实体首次出现的来源。
      for (const match of query.matches) {
        const top = match.fieldPath[0]
        match.sourceId = top?.kind === 'property' ? parsed.fieldSources[top.key]?.at(-1) ?? null : null
      }
      return page(0)
    }
    case 'page': return page(request.input)
    case 'watches': return evaluateWatches(index, request.input, complete)
    case 'detail': {
      const resolved = resolvePath(index, request.input)
      const first = request.input[0]
      return { path: request.input, known: resolved.known && complete, sourceIds: first?.kind === 'property' ? parsed.fieldSources[first.key] ?? [] : [], tree: resolved.node ? buildTree(nodeInput(resolved.node), 10000, 60, formatPath(request.input), resolved.node.key, request.input) : null }
    }
  }
}
globalThis.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  sequence = sequence.catch(() => {
  }).then(async () => {
    try {
      globalThis.postMessage({ id: request.id, snapshot: request.snapshot, output: await handle(request) })
    }
    catch (error) {
      globalThis.postMessage({ id: request.id, snapshot: request.snapshot, error: error instanceof Error ? error.message : String(error) })
    }
  })
}
