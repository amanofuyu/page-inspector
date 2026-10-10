import { stringify } from 'devalue'
import { describe, expect, it } from 'vitest'
import { copyNodeValue } from '../features/nuxt/copy'
import { fieldDetail, resolveValue } from '../features/nuxt/detail'
import { buildTree } from '../features/nuxt/format'
import { parseApp } from '../features/nuxt/parse'
import { HOLE } from '../features/nuxt/path'
import { PayloadTag } from '../features/nuxt/types'

function parsed(payload: Record<string, unknown>) {
  return parseApp({ id: 'app', label: '测试', externalUrl: null, serverRendered: true, sources: [{ kind: 'inline', text: stringify(payload), url: null, bytes: 100, fetchedAt: 1, sourceId: 'inline' }] })
}

describe('无分析索引的字段详情', () => {
  it('选中被截断分支时从原始数据重建局部树，保留完整值和来源', () => {
    const source = parsed({ data: { title: '完整字段', list: [1, 2, 3] } })
    const node = buildTree(source.payload, 2).root.children![0]!
    expect(node.truncated).toBe(true)
    const detail = fieldDetail(source, node)!
    expect(detail.sourceIds).toEqual(['inline'])
    expect(detail.tree?.truncated).toBe(false)
    expect(JSON.parse(copyNodeValue(detail.tree!.root).text)).toEqual({ title: '完整字段', list: [1, 2, 3] })
  })
  it('共享引用选中后可独立查看和复制，循环引用仍有界', () => {
    const shared: Record<string, unknown> = { amount: 12 }
    shared.self = shared
    const source = parsed({ data: { first: shared, second: shared } })
    const node = buildTree(source.payload!.data).root.children!.find(node => node.key === 'second')!
    node.fieldPath = [{ kind: 'property', key: 'data' }, { kind: 'property', key: 'second' }]
    expect(node.reference).toBeDefined()
    const detail = fieldDetail(source, node)!
    expect(detail.tree?.root.children?.find(child => child.key === 'amount')?.value).toBe(12)
    expect(copyNodeValue(detail.tree!.root).format).toBe('javascript')
  })
  it('区分不存在、undefined 和数组空洞，只访问对象自己的属性', () => {
    const data: unknown[] = []
    data[0] = undefined
    data[2] = 2
    const value = { data }
    const path = [{ kind: 'property' as const, key: 'data' }]
    expect(resolveValue(value, [...path, { kind: 'index', index: 0 }])).toEqual({ found: true, value: undefined })
    expect(resolveValue(value, [...path, { kind: 'index', index: 1 }]).value).toBe(HOLE)
    expect(resolveValue(value, [...path, { kind: 'index', index: 3 }]).found).toBe(false)
    expect(resolveValue(value, [...path, { kind: 'index', index: 0.5 }]).found).toBe(false)
    expect(resolveValue(value, [{ kind: 'property', key: 'toString' }]).found).toBe(false)
  })
  it('保留 Nuxt 包装、Map 键值、Set 和二进制字节路径', () => {
    const key = { name: '键' }
    const value = new PayloadTag('Ref', { map: new Map([[key, '值']]), set: new Set([key]), bytes: new Uint8Array([7, 8]) })
    const property = (key: string) => ({ kind: 'property' as const, key })
    expect(resolveValue(value, [property('map'), { kind: 'map-key', index: 0 }, property('name')]).value).toBe('键')
    expect(resolveValue(value, [property('map'), { kind: 'map-value', index: 0 }]).value).toBe('值')
    expect(resolveValue(value, [property('map'), { kind: 'map-entry', index: 0 }]).value).toEqual({ key, value: '值' })
    expect(resolveValue(value, [property('set'), { kind: 'set', index: 0 }, property('name')]).value).toBe('键')
    expect(resolveValue(value, [property('bytes'), { kind: 'index', index: 1 }]).value).toBe(8)
  })
  it('详情使用最新快照，元信息聚合根使用展示树', () => {
    const source = parsed({ data: { title: '旧值' } })
    const node = buildTree(source.payload).root.children![0]!
    const next = parsed({ data: { title: '新值' } })
    expect(fieldDetail(next, node)?.tree?.root.children?.[0]?.value).toBe('新值')
    node.fieldPath = undefined
    expect(fieldDetail(next, node)).toBeNull()
  })
})
