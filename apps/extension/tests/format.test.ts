import { stringify } from 'devalue'
import { describe, expect, it } from 'vitest'
import { buildPayloadView, buildTree, exportNode, searchTree } from '../features/nuxt/format'
import { parsePayload } from '../features/nuxt/parse'
import { PayloadTag } from '../features/nuxt/types'

describe('类型、引用与展示预算', () => {
  it('循环和重复引用显示原始路径，导出仍可序列化', () => {
    const object: Record<string, unknown> = { text: 'hello' }
    object.self = object
    const tree = buildTree({ a: object, b: object })
    expect(tree.root.children?.[0]?.children?.[1]?.reference).toBe('$["a"]')
    expect(tree.root.children?.[1]?.reference).toBe('$["a"]')
    expect(JSON.parse(exportNode(tree.root)).format).toBe('page-inspector/v1')
  })
  it('区分未定义、空值、特殊数值、空洞和字符串', () => {
    const list = [undefined, null, Number.NaN, -0, 0n, 'undefined', undefined, false]
    delete list[6]
    const children = buildTree(list).root.children!
    expect(children.map(node => node.type)).toEqual(['undefined', 'null', 'number', 'number', 'bigint', 'string', 'empty', 'boolean'])
    expect(children[2]?.value).toBe('NaN')
    expect(children[3]?.value).toBe('-0')
    expect(children[4]?.preview).toBe('0n')
  })
  it('保留 Nuxt 包装标记、Map 键和值及 Set 成员', () => {
    const root = buildTree(new PayloadTag('Ref', new Map([[{ key: 1 }, new Set(['a'])]]))).root
    expect(root.type).toBe('Ref → Map')
    expect(root.children?.[0]?.children!.map(node => node.key)).toEqual(['key', 'value'])
    expect(root.children?.[0]?.children?.[1]?.children?.[0]?.value).toBe('a')
  })
  it('devalue 装箱标量在预览、搜索和导出中保留类型和值', () => {
    const boxed = [new Object(123), new Object(-0), new Object(Number.NaN), new Object(Infinity), new Object(false), new Object('中文字符串'), new Object(12n)]
    const parsed = parsePayload(stringify({ data: boxed, alias: boxed[0] })).value
    const root = buildTree(parsed).root
    const values = root.children![0]!.children!
    expect(values.map(node => node.type)).toEqual(['BoxedNumber', 'BoxedNumber', 'BoxedNumber', 'BoxedNumber', 'BoxedBoolean', 'BoxedString', 'BoxedBigInt'])
    expect(values.map(node => node.value)).toEqual([123, '-0', 'NaN', 'Infinity', false, '中文字符串', '12'])
    expect(values.map(node => node.preview)).toEqual(['123', '-0', 'NaN', 'Infinity', 'false', '"中文字符串"', '12n'])
    expect(root.children![1]!.reference).toBe(values[0]!.path)
    expect(searchTree(root, '中文字符串').matches[0]!.type).toBe('BoxedString')
    expect(JSON.parse(exportNode(values[0]!)).node).toMatchObject({ type: 'BoxedNumber', value: 123 })
    expect(buildTree(new PayloadTag('Ref', new Object(0))).root).toMatchObject({ type: 'Ref → BoxedNumber', value: 0 })
  })
  it('节点数和深度受限，标记截断', () => {
    expect(buildTree(Array.from({ length: 10000 }, (_, i) => i), 100).count).toBe(100)
    expect(buildTree({ a: { b: { c: 1 } } }, 100, 1).truncated).toBe(true)
    expect(buildTree([], 1).truncated).toBe(false)
  })
  it('搜索键、完整字符串和值，限制结果数', () => {
    const tree = buildTree({ title: 'Nuxt', long: `${'a'.repeat(500)}needle`, rows: [1, 1, 1] })
    expect(searchTree(tree.root, 'NUXT').matches[0]?.key).toBe('title')
    expect(searchTree(tree.root, 'needle').matches[0]?.key).toBe('long')
    expect(searchTree(tree.root, '1', 2)).toMatchObject({ limited: true, matches: expect.any(Array) })
    expect(searchTree(tree.root, '1', 2).matches).toHaveLength(2)
  })
})

it('大 data 不会消耗其他分类的预算，字段路径保持原始位置', () => {
  const payload = { data: Array.from({ length: 20000 }, (_, i) => i), state: { counter: 1 } }
  expect(buildPayloadView(payload, 'data')!.truncated).toBe(true)
  const state = buildPayloadView(payload, 'state')!
  expect(state.root.children?.[0]?.path).toBe('$["state"]["counter"]')
  expect(state.root.children?.[0]?.value).toBe(1)
  expect(buildPayloadView(payload, '_errors')).toBeNull()
})
