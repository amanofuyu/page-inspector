import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { copyNodeValue } from '../features/nuxt/copy'
import { buildTree } from '../features/nuxt/format'
import { PayloadTag } from '../features/nuxt/types'

const copy = (value: unknown) => copyNodeValue(buildTree(value).root)
// 仅在测试沙箱中还原本文件生成的已知样例；扩展运行时不会执行复制文本。
const evaluate = (text: string) => runInNewContext(`(${text})`, { URL, URLSearchParams }, { timeout: 1000 })

describe('复制当前值', () => {
  it('普通对象和数组输出业务 JSON，不带节点元信息', () => {
    const value = { title: '页面', enabled: false, price: 0, items: [null, { nested: '值' }] }
    const result = copy(value)
    expect(result.format).toBe('json')
    expect(result.text).toBe(JSON.stringify(value, null, 2))
    expect(JSON.parse(result.text)).toEqual(value)
  })

  it('字符串复制完整文本，保留空值、换行和转义字符', () => {
    for (const value of ['', '"引号"\n换行\\路径', '中文😀'.repeat(500)])
      expect(copy(value)).toEqual({ text: value, format: 'text' })
  })

  it('保留 undefined、特殊数值及 BigInt，不伪装成字符串或 null', () => {
    for (const value of [undefined, -0, Number.NaN, Infinity, -Infinity, 99n]) {
      const result = copy(value)
      expect(result.format).toBe('javascript')
      expect(Object.is(evaluate(result.text), value)).toBe(true)
    }
    expect(copy(undefined).text).toBe('undefined')
    expect(copy(-0).text).toBe('-0')
    expect(copy(99n).text).toBe('99n')
  })

  it('移除 Nuxt 包装标记，嵌套字段仍取真实值', () => {
    const value = new PayloadTag('Reactive', { count: new PayloadTag('Ref', 1), title: new PayloadTag('ShallowRef', 'hello') })
    expect(JSON.parse(copy(value).text)).toEqual({ count: 1, title: 'hello' })
  })

  it('数组空洞与显式 undefined 保持区别', () => {
    const array = [1, undefined, undefined, undefined]
    delete array[1]
    delete array[3]
    const result = evaluate(copy(array).text)
    expect(result.length).toBe(4)
    expect(1 in result).toBe(false)
    expect(2 in result).toBe(true)
    expect(3 in result).toBe(false)
  })

  it('共享对象和循环引用可以还原，引用身份保持一致', () => {
    const shared = { name: '共享' }
    const value: Record<string, unknown> = { left: shared, right: shared }
    value.self = value
    const result = evaluate(copy(value).text)
    expect(result.left.name).toBe('共享')
    expect(result.left).toBe(result.right)
    expect(result.self).toBe(result)
  })

  it('map 与 Set 保留键、成员和循环关系', () => {
    const shared = { id: 1 }
    const map = new Map<unknown, unknown>([[shared, new Set([shared])]])
    map.set('self', map)
    const result = evaluate(copy(map).text)
    const key = [...result.keys()][0]
    expect(result.get(key).has(key)).toBe(true)
    expect(result.get('self')).toBe(result)
  })

  it('日期、无效日期、正则和 URL 保留各自语义', () => {
    expect(evaluate(copy(new Date('2026-01-01T00:00:00Z')).text).toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(Number.isNaN(evaluate(copy(new Date(Number.NaN)).text).getTime())).toBe(true)
    expect(evaluate(copy(/a\/?b/gi).text).toString()).toBe('/a\\/?b/gi')
    expect(evaluate(copy(new URL('https://example.com/a?q=1')).text).href).toBe('https://example.com/a?q=1')
    expect(evaluate(copy(new URLSearchParams('a=1&a=2')).text).getAll('a')).toEqual(['1', '2'])
  })

  it('二进制按原字节还原，装箱对象保留类型和别名', () => {
    const typed = new Int16Array([-1, 256])
    const result = evaluate(copy(typed).text)
    expect(Object.prototype.toString.call(result)).toBe('[object Int16Array]')
    expect([...result]).toEqual([...typed])
    const boxed = new Object(99n)
    const repeated = evaluate(copy({ first: boxed, second: boxed }).text)
    expect(repeated.first.valueOf()).toBe(99n)
    expect(repeated.first).toBe(repeated.second)
  })

  it('特殊属性名仍作为自有属性，不更改原型', () => {
    const value = JSON.parse('{"__proto__":{"polluted":true},"constructor":"value","a\\\"b":1}')
    const result = JSON.parse(copy(value).text)
    expect(Object.keys(result)).toEqual(['__proto__', 'constructor', 'a"b'])
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')?.value).toEqual({ polluted: true })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('截断、未解析引用和不支持的类型明确报错，不返回错误值', () => {
    expect(() => copyNodeValue(buildTree({ data: [1, 2, 3] }, 3).root)).toThrow('超出展示上限')
    const shared = { id: 1 }
    const reference = buildTree({ a: shared, b: shared }).root.children![1]!
    expect(() => copyNodeValue(reference)).toThrow('无法解析的引用')
    const cyclicTag = new PayloadTag('Ref', null)
    cyclicTag.value = cyclicTag
    expect(() => copy(cyclicTag)).toThrow('无法解析的引用')
    expect(() => copy(Symbol('symbol'))).toThrow('暂不支持')
  })
})
