import type { NodeSummary, PayloadIndex } from '../inspection/model'
import type { CollectedApp, ParsedApp } from '../nuxt/types'
import { summary } from '../inspection/graph'
import { PayloadTag } from '../nuxt/types'
import { encodeStructure, ESTIMATE_ALGORITHM } from './estimate'

export function nodeInput(node: PayloadIndex['nodes'][number]) {
  let input = node.value
  for (const tag of [...node.tags].reverse())
    input = new PayloadTag(tag, input)
  return input
}
export async function sourceMetrics(app: CollectedApp, parsed: ParsedApp) {
  return Promise.all(app.sources.map(async (source, index) => {
    const raw = source.text === null ? null : new TextEncoder().encode(source.text)
    const digest = raw === null ? null : Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw))).map(value => value.toString(16).padStart(2, '0')).join('')
    return {
      sourceId: source.sourceId ?? `${app.id}:${index}`,
      kind: source.kind,
      transport: source.transport ?? (source.kind === 'inline' ? 'dom' : 'extension-fetch'),
      url: source.url,
      rawUtf8Bytes: raw?.byteLength ?? null,
      messageBytes: source.text === null ? source.messageBytes ?? null : new TextEncoder().encode(JSON.stringify(source.text)).byteLength,
      readBytesLowerBound: source.readBytesLowerBound ?? 0,
      complete: source.text !== null,
      fetchedAt: source.fetchedAt,
      digest,
      parseStatus: parsed.sources[index]?.status ?? 'error',
      error: source.error ?? parsed.sources[index]?.diagnostic,
    }
  }))
}
export interface RankingItem extends NodeSummary {
  estimatedBytes: number
  references: number
  complete: boolean
}
export async function analyzeIndex(index: PayloadIndex, cancelled = () => false) {
  const started = performance.now()
  const deadline = started + 2000
  const rows: RankingItem[] = []
  let visited = 0
  const candidates = index.nodes.slice(1).sort((a, b) => (b.itemCount ?? (typeof b.value === 'string' ? b.value.length : 0)) - (a.itemCount ?? (typeof a.value === 'string' ? a.value.length : 0)))
  for (const node of candidates) {
    if (performance.now() > deadline || cancelled())
      break
    const result = encodeStructure(nodeInput(node), { deadline })
    rows.push({ ...summary(node), estimatedBytes: result.bytes, references: result.references, complete: result.coverage.status === 'complete' })
    visited++
    if (visited % 128 === 0)
      await new Promise(resolve => setTimeout(resolve, 0))
  }
  rows.sort((a, b) => b.estimatedBytes - a.estimatedBytes)
  const distribution = {
    strings: index.nodes.filter(node => node.baseType === 'string').sort((a, b) => (b.value as string).length - (a.value as string).length).slice(0, 20).map(node => ({ ...summary(node), length: (node.value as string).length })),
    collections: index.nodes.filter(node => node.itemCount !== null && node.fieldPath.length).sort((a, b) => b.itemCount! - a.itemCount!).slice(0, 20).map(node => summary(node)),
    deep: [...index.nodes].sort((a, b) => b.fieldPath.length - a.fieldPath.length).slice(0, 10).map(node => summary(node)),
    sharedEdges: index.nodes.filter(node => node.reference !== undefined).length,
  }
  const partial = visited < candidates.length || rows.some(row => !row.complete) || index.coverage.status !== 'complete'
  return {
    algorithm: ESTIMATE_ALGORITHM,
    rows: rows.slice(0, 100),
    distribution,
    coverage: { ...index.coverage, status: partial ? 'partial' as const : 'complete' as const, scanned: visited, reasons: [...index.coverage.reasons, ...(visited < candidates.length ? ['字段估算达到任务预算'] : []), ...(rows.some(row => !row.complete) ? ['部分字段仅有估算下界'] : [])] },
    durationMs: performance.now() - started,
  }
}
/** 分析报告不包含字段预览及业务值，仅包含路径、类型和度量。 */
export function analysisReport(snapshotId: string, metrics: Awaited<ReturnType<typeof sourceMetrics>>, result: Awaited<ReturnType<typeof analyzeIndex>>) {
  const strip = ({ preview: _preview, ...row }: NodeSummary & Record<string, unknown>) => row
  return { format: 'page-inspector-analysis/v1', snapshotId, generatedAt: Date.now(), algorithm: result.algorithm, coverage: result.coverage, sources: metrics.map(({ error, ...metric }) => ({ ...metric, hasError: !!error })), fields: result.rows.map(row => strip({ ...row })), distribution: { sharedEdges: result.distribution.sharedEdges, strings: result.distribution.strings.map(row => strip({ ...row })), collections: result.distribution.collections.map(row => strip({ ...row })), deep: result.distribution.deep.map(row => strip({ ...row })) }, note: '字段独立估算，可能共享对象，不能相加推算原文或压缩传输体积。' }
}
