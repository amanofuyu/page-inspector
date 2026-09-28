import type { CollectedApp, PageSnapshot } from '../features/nuxt/types'
import type { QuerySpec } from '../features/query/engine'
import type { WatchRule } from '../features/watch/model'
import { stringify } from 'devalue'
import { describe, expect, it } from 'vitest'
import { encodeStructure } from '../features/analysis/estimate'
import { analysisReport, analyzeIndex, sourceMetrics } from '../features/analysis/report'
import { buildIndex, resolvePath } from '../features/inspection/graph'
import { HOLE } from '../features/inspection/model'
import { buildPayloadView } from '../features/nuxt/format'
import { parseApp } from '../features/nuxt/parse'
import { PayloadTag } from '../features/nuxt/types'
import { queryIndex } from '../features/query/engine'
import { exactPath, formatPath, parsePath } from '../features/query/path'
import { evaluateWatches, matchesScope, scopeFor, validDefinition, WatchSession } from '../features/watch/model'

function app(value: unknown): CollectedApp {
  return { id: 'nuxt:0', declaredId: 'nuxt', label: 'nuxt', externalUrl: null, serverRendered: true, sources: [{ kind: 'inline', url: 'https://example.com/', text: stringify(value), bytes: 0, fetchedAt: 1 }] }
}
const scope = { origin: 'https://example.com', pathname: '/test', app: 'nuxt', query: null }
function rule(path: string, id = 'field'): WatchRule {
  return { version: 1, kind: 'watch', id, name: id, scope, path: exactPath(path), createdAt: 1 }
}
function spec(conditions: QuerySpec['conditions'], category: QuerySpec['category'] = 'data', combine: QuerySpec['combine'] = 'all'): QuerySpec {
  return { conditions, category, combine }
}
function sparse() {
  const result: unknown[] = []
  result.length = 2
  result[1] = undefined
  return result
}
function canonical(value: unknown) {
  return encodeStructure(value, { capture: true }).canonical
}
describe('结构化路径与独立索引', () => {
  it('区分转义属性、数字属性、数组位置、Map 与 Set', () => {
    const path = [{ kind: 'property' as const, key: '中文."[x]\\' }, { kind: 'property' as const, key: '0' }, { kind: 'index' as const, index: 0 }, { kind: 'map-value' as const, index: 2 }, { kind: 'set' as const, index: 1 }]
    expect(exactPath(formatPath(path))).toEqual(path)
    expect(parsePath('products[*].*')).toHaveLength(3)
    expect(() => exactPath('products[*]')).toThrow()
    expect(() => parsePath('[set:0:key]')).toThrow()
    expect(() => parsePath('x[alert(1)]')).toThrow()
  })
  it('存储重排路径段键序后，属性、数组、Map 和 Set 关注仍可定位', async () => {
    const index = await buildIndex({ data: { items: [{ price: 120 }], map: new Map([['价格', 120]]), set: new Set([120]) } })
    const rules = ['data.items[0].price', 'data.map[map:0:key]', 'data.map[map:0:value]', 'data.set[set:0]'].map((path, i) => {
      const saved = rule(path, String(i))
      // 模拟 chrome.storage 读取后的键排序，同时保留原有规则格式。
      saved.path = saved.path.map(segment => Object.fromEntries(Object.entries(segment).sort(([a], [b]) => a.localeCompare(b)))) as typeof saved.path
      return saved
    })
    expect(rules.map(saved => resolvePath(index, saved.path).node?.value)).toEqual([120, '价格', 120, 120])
    expect(evaluateWatches(index, rules, true).map(value => value.presence)).toEqual(['found', 'found', 'found', 'found'])
  })
  it('循环只索引一次实体，有限路径可沿别名找到值', async () => {
    const shared = { value: 42, self: null as unknown }
    shared.self = shared
    const index = await buildIndex({ first: shared, alias: shared })
    expect(index.nodes).toHaveLength(5)
    expect(resolvePath(index, exactPath('alias.self.self.value')).node?.value).toBe(42)
    expect(index.coverage.status).toBe('complete')
  })
  it('可找到 10,000 视图节点之外的字段，并标明独立索引截断', async () => {
    const value = { data: Object.fromEntries(Array.from({ length: 12000 }, (_, i) => [`key${i}`, i])) }
    expect(buildPayloadView(value, 'data')!.truncated).toBe(true)
    const index = await buildIndex(value)
    expect(resolvePath(index, exactPath('data.key11999')).node?.value).toBe(11999)
    const limited = await buildIndex(value, {}, { nodes: 20, depth: 100, ms: 2000 })
    expect(limited.coverage.status).toBe('partial')
    expect(resolvePath(limited, exactPath('data.key11999')).known).toBe(false)
  })
  it('树路径保留集合类型，Map 伪条目的子节点指向真实键和值', async () => {
    const data = { map: new Map([['key', { price: 9 }]]), set: new Set(['x']), list: [1] }
    const tree = buildPayloadView({ data }, 'data')!
    const mapValue = tree.root.children![0]!.children![0]!.children![1]!
    const index = await buildIndex({ data })
    expect(formatPath(mapValue.fieldPath!)).toBe('$["data"]["map"][map:0:value]')
    expect(resolvePath(index, mapValue.fieldPath!).node?.baseType).toBe('Object')
    expect(tree.root.children![2]!.children![0]!.fieldPath?.at(-1)?.kind).toBe('index')
  })
})
describe('原文度量与有界结构估算', () => {
  it('中文 emoji、换行和反斜杠的原文与消息预算分别计量，失败来源不算零原文', async () => {
    const source = app({ data: '中文😀\n\\"' })
    source.sources.push({ kind: 'external', url: '/bad', text: null, bytes: 999, fetchedAt: 2, error: '失败' })
    const metrics = await sourceMetrics(source, parseApp(source))
    expect(metrics[0]!.rawUtf8Bytes).toBe(new TextEncoder().encode(source.sources[0]!.text!).byteLength)
    expect(metrics[0]!.messageBytes).toBeGreaterThan(metrics[0]!.rawUtf8Bytes!)
    expect(metrics[1]!.rawUtf8Bytes).toBeNull()
    expect(metrics[0]!.digest).toHaveLength(64)
  })
  it('循环与共享引用有显式标记；独立字段估算不冒充可相加的原文', () => {
    const shared = { a: 'x' }
    const value: Record<string, unknown> = { x: shared, y: shared }
    value.self = value
    const result = encodeStructure(value, { capture: true })
    expect(result.coverage.status).toBe('complete')
    expect(result.references).toBe(2)
    expect(result.canonical).toContain('"ref"')
    expect(canonical(value)).not.toBe(canonical({ x: { a: 'x' }, y: { a: 'x' } }))
  })
  it('特殊类型与预览之后的差异仍参与精确比较', () => {
    expect(canonical(Object.assign(Object.create(null), { a: 1 }))).not.toBe(canonical({ a: 1 }))
    expect(canonical(-0)).not.toBe(canonical(0))
    expect(canonical(Number.NaN)).not.toBe(canonical(null))
    expect(canonical(1n)).not.toBe(canonical('1'))
    expect(canonical(new PayloadTag('Ref', 1))).not.toBe(canonical(1))
    expect(canonical(new RegExp(`${'a'.repeat(400)}x`))).not.toBe(canonical(new RegExp(`${'a'.repeat(400)}y`)))
    expect(canonical(new URL(`https://example.com/${'a'.repeat(400)}x`))).not.toBe(canonical(new URL(`https://example.com/${'a'.repeat(400)}y`)))
    expect(canonical(new Uint8Array([1, 2]))).not.toBe(canonical(new Uint8Array([1, 3])))
    expect(canonical(sparse())).not.toBe(canonical([undefined, undefined]))
    expect(encodeStructure('x'.repeat(1000), { capture: true, maxBytes: 100 }).canonical).toBeNull()
  })
  it('来源浅合并保留覆盖历史，报告默认不带业务值', async () => {
    const source = app({ data: { secret: 'sensitive-unique-value' } })
    source.sources.push({ kind: 'external', url: '/payload', text: stringify({ data: { next: 'sensitive-second' } }), bytes: 0, fetchedAt: 2 })
    const parsed = parseApp(source)
    expect(parsed.fieldSources.data).toHaveLength(2)
    const index = await buildIndex(parsed.payload!, parsed.fieldSources)
    expect(index.nodes[1]!.sourceId).toBe(parsed.sources[1]!.sourceId)
    const report = analysisReport('snapshot', await sourceMetrics(source, parsed), await analyzeIndex(index))
    expect(JSON.stringify(report)).not.toContain('sensitive-')
    expect(report.format).toBe('page-inspector-analysis/v1')
  })
})
describe('高级检索', () => {
  it('路径通配与数值条件组合，不把字符串当数字', async () => {
    const index = await buildIndex({ data: { products: [{ price: 120 }, { price: '200' }, { price: 80 }] } })
    const result = await queryIndex(index, spec([{ field: 'path', op: 'eq', value: 'products[*].price' }, { field: 'value', op: 'gt', valueType: 'number', value: '100' }]))
    expect(result.matches.map(row => row.path)).toEqual(['$["data"]["products"][0]["price"]'])
    expect(result.coverage.status).toBe('complete')
    expect((await queryIndex(index, spec([{ field: 'value', op: 'eq', valueType: 'string', value: '200' }]))).matches).toHaveLength(1)
  })
  it('业务数组不复用标签集合的包含比较，值条件保留显式类型', async () => {
    const index = await buildIndex({ data: { list: ['100'], number: 100, text: '100', tagged: new PayloadTag('Ref', false) } })
    const equal = await queryIndex(index, spec([{ field: 'value', op: 'eq', valueType: 'number', value: '100' }]))
    expect(equal.matches.map(match => match.path)).toEqual(['$["data"]["number"]'])
    const strings = await queryIndex(index, spec([{ field: 'value', op: 'eq', valueType: 'string', value: '100' }]))
    expect(strings.matches.map(match => match.path)).toEqual(['$["data"]["list"][0]', '$["data"]["text"]'])
    const unequal = await queryIndex(index, spec([{ field: 'path', op: 'eq', value: 'list' }, { field: 'value', op: 'ne', valueType: 'number', value: '100' }]))
    expect(unequal.matches).toHaveLength(1)
    expect((await queryIndex(index, spec([{ field: 'value', op: 'contains', valueType: 'number', value: '100' }]))).matches).toHaveLength(0)
    for (const op of ['eq', 'contains'] as const)
      expect((await queryIndex(index, spec([{ field: 'tag', op, value: 'Ref' }]))).matches.map(match => match.path)).toEqual(['$["data"]["tagged"]'])
  })
  it('区分缺失、空洞、undefined、null 与空字符串', async () => {
    const index = await buildIndex({ data: { items: [{ x: undefined }, {}, { x: null }, { x: '' }], holes: sparse() } })
    const missing = await queryIndex(index, spec([{ field: 'path', op: 'missing', value: 'items[*].x' }]))
    expect(missing.matches.map(row => row.path)).toEqual(['$["data"]["items"][1]["x"]'])
    expect((await queryIndex(index, spec([{ field: 'path', op: 'exists', value: 'holes[*]' }]))).matches).toHaveLength(1)
    expect((await queryIndex(index, spec([{ field: 'value', op: 'eq', valueType: 'undefined', value: '' }]))).matches).toHaveLength(2)
    expect((await queryIndex(index, spec([{ field: 'value', op: 'eq', valueType: 'empty', value: '' }]))).matches[0]!.baseType).toBe('empty')
    expect(index.nodes.some(node => node.value === HOLE)).toBe(true)
  })
  it('别名查询保留请求的路径，取消与截断不报告完整零结果', async () => {
    const shared = { price: 10 }
    const index = await buildIndex({ data: { first: shared, alias: shared } })
    const result = await queryIndex(index, spec([{ field: 'path', op: 'eq', value: 'alias.price' }]))
    expect(result.matches[0]!.path).toBe('$["data"]["alias"]["price"]')
    expect((await queryIndex(index, spec([]), () => true)).coverage.status).toBe('partial')
    const limited = await buildIndex({ data: { a: 1, b: 2 } }, {}, { nodes: 3, depth: 100, ms: 2000 })
    const unknown = await queryIndex(limited, spec([{ field: 'path', op: 'missing', value: 'b' }]))
    expect(unknown.matches[0]!.uncertain).toBe(true)
    expect(unknown.coverage.status).toBe('partial')
  })
  it('任一条件、基础类型与 Nuxt 标签可组合，最多返回 1000 条', async () => {
    const index = await buildIndex({ data: { ref: new PayloadTag('Ref', false), many: Array.from({ length: 1100 }, (_, i) => i) } })
    const result = await queryIndex(index, spec([{ field: 'tag', op: 'eq', value: 'Ref' }, { field: 'type', op: 'eq', value: 'undefined' }], 'data', 'any'))
    expect(result.matches).toHaveLength(1)
    expect((await queryIndex(index, spec([{ field: 'type', op: 'eq', value: 'number' }]))).limited).toBe(true)
    await expect(queryIndex(index, spec([{ field: 'value', op: 'gt', valueType: 'number', value: '1oops' }]))).rejects.toThrow()
  })
})
describe('字段关注与范围', () => {
  it('刷新识别变化、类型变化、删除与未知，未知不覆盖基线', async () => {
    const session = new WatchSession()
    session.reset('tab1:path:app:merged')
    const rules = [rule('data.x')]
    async function update(id: string, value: unknown, complete = true) {
      return session.update(id, evaluateWatches(await buildIndex(value), rules, complete))[0]!
    }
    expect((await update('1', { data: { x: 1 } })).status).toBe('首次出现')
    expect((await update('2', { data: { x: 1 } })).status).toBe('未变化')
    expect((await update('3', { data: { x: 2 } })).status).toBe('值变化')
    expect((await update('4', { data: { x: '2' } })).status).toBe('类型变化')
    expect((await update('5', { data: {} }, false)).status).toBe('无法确认')
    expect((await update('6', { data: { x: '2' } })).status).toBe('未变化')
    expect((await update('7', { data: {} })).status).toBe('缺失')
    session.reset('tab2:path:app:merged')
    expect((await update('8', { data: { x: '2' } })).status).toBe('首次出现')
  })
  it('对象键序不影响相等，共享关系与数组重排影响相等，预算不足为未知', async () => {
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }))
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]))
    const values = evaluateWatches(await buildIndex({ large: 'x'.repeat(1100000) }), [rule('large')], true)
    expect(values[0]!.presence).toBe('unknown')
    const partial = await buildIndex({ nested: { deep: { value: 1 } } }, {}, { nodes: 100, depth: 1, ms: 2000 })
    expect(evaluateWatches(partial, [rule('absent')], true)[0]!.presence).toBe('unknown')
  })
  it('无原型对象的键序变化不产生关注误报，但类型和值变化仍能识别', async () => {
    const session = new WatchSession()
    const rules = [rule('data')]
    const first = Object.assign(Object.create(null), { a: 1, b: 2 })
    const reordered = Object.assign(Object.create(null), { b: 2, a: 1 })
    const changed = Object.assign(Object.create(null), { b: 3, a: 1 })
    const update = async (id: string, data: unknown) => session.update(id, evaluateWatches(await buildIndex({ data }), rules, true))[0]!.status
    expect(await update('first', first)).toBe('首次出现')
    expect(await update('reordered', reordered)).toBe('未变化')
    expect(await update('changed', changed)).toBe('值变化')
    expect(await update('plain', { a: 1, b: 3 })).toBe('类型变化')
  })
  it('按唯一声明标识绑定，不受应用换序影响，重名和缺失标识拒绝自动绑定', () => {
    const first = app({ data: {} })
    const second = { ...first, id: 'second:1', declaredId: 'second' }
    const snapshot: PageSnapshot = { pageUrl: 'https://example.com/test?q=1#hash', initialUrl: 'https://example.com/test?q=1', title: '', collectedAt: 1, apps: [first, second], warnings: [] }
    const before = scopeFor(snapshot, first)!
    snapshot.apps.reverse()
    expect(scopeFor(snapshot, first)).toEqual(before)
    expect(matchesScope(before, scopeFor(snapshot, first, true))).toBe(true)
    expect(matchesScope({ ...before, query: '?q=2' }, scopeFor(snapshot, first, true))).toBe(false)
    snapshot.apps.push({ ...first, id: 'duplicate:2' })
    expect(scopeFor(snapshot, first)).toBeNull()
    expect(scopeFor(snapshot, { ...second, declaredId: null })).toBeNull()
    expect(validDefinition({ ...rule('data'), version: 99 })).toBe(false)
  })
})
