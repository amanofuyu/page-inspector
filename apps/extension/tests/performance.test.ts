import { Buffer } from 'node:buffer'
import { performance } from 'node:perf_hooks'
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
