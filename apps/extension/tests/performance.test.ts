import { Buffer } from 'node:buffer'
import { writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { stringify } from 'devalue'
import { describe, expect, it } from 'vitest'
import { buildTree, searchTree } from '../features/nuxt/format'
import { parsePayload } from '../features/nuxt/parse'

describe('大数据预算（Node 环境基准）', () => {
  it('记录 100 KB、1 MB、10 MB 的解析、建树和搜索耗时', () => {
    const measurements = []
    for (const target of [100 * 1024, 1024 * 1024, 10 * 1024 * 1024]) {
      const entries = Array.from({ length: Math.floor(target / 1100) }, (_, index) => ({ id: index, text: `${index}-${'示例'.repeat(170)}-needle` }))
      const text = stringify({ data: entries })
      const start = performance.now()
      const parsed = parsePayload(text)
      const parsedAt = performance.now()
      const tree = buildTree(parsed.value)
      const builtAt = performance.now()
      const found = searchTree(tree.root, 'needle')
      const searchedAt = performance.now()
      expect(tree.count).toBeLessThanOrEqual(10000)
      expect(found.matches.length).toBeGreaterThan(0)
      measurements.push({ bytes: Buffer.byteLength(text), parseMs: +(parsedAt - start).toFixed(1), treeMs: +(builtAt - parsedAt).toFixed(1), searchMs: +(searchedAt - builtAt).toFixed(1), nodes: tree.count })
    }
    console.table(measurements)
  })
})

// 记录完整解析后独立索引、分析和查询的时间及进程堆增量，堆增量不冒充峰值。
describe('扩展能力预算（Node 环境趋势）', () => {
  it('100 KiB／1 MiB／10 MiB 样本保持可观测覆盖范围', async () => {
    const { buildIndex } = await import('../features/inspection/graph')
    const { analyzeIndex } = await import('../features/analysis/report')
    const { queryIndex } = await import('../features/query/engine')
    const measurements = []
    for (const target of [100 * 1024, 1024 * 1024, 10 * 1024 * 1024]) {
      const text = stringify({ data: Array.from({ length: Math.floor(target / 1100) }, (_, id) => ({ id, message: `${id}-中文😀-${'示例'.repeat(170)}` })) })
      const before = process.memoryUsage().heapUsed
      const parsed = parsePayload(text)
      const start = performance.now()
      const index = await buildIndex(parsed.value)
      const indexedAt = performance.now()
      const analysis = await analyzeIndex(index)
      const analyzedAt = performance.now()
      const result = await queryIndex(index, { combine: 'all', category: 'data', conditions: [{ field: 'value', op: 'contains', value: '中文😀' }] })
      expect(index.nodes.length).toBeLessThanOrEqual(100000)
      expect(result.matches.length).toBeGreaterThan(0)
      expect(result.matches.length).toBeLessThanOrEqual(1000)
      measurements.push({ bytes: Buffer.byteLength(text), indexMs: +(indexedAt - start).toFixed(1), analysisMs: +(analyzedAt - indexedAt).toFixed(1), queryMs: +(performance.now() - analyzedAt).toFixed(1), heapDeltaMiB: +((process.memoryUsage().heapUsed - before) / 1048576).toFixed(1), processPeakRssMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(1), nodes: index.nodes.length, coverage: analysis.coverage.status })
    }
    console.table(measurements)
    writeFileSync('/tmp/page-inspector-feature-performance.json', JSON.stringify({ node: process.version, platform: process.platform, timestamp: new Date().toISOString(), measurements }, null, 2))
  }, 15000)
})
