import type { CollectedApp } from '../features/nuxt/types'
import { readFileSync } from 'node:fs'
import { stringify } from 'devalue'
import { describe, expect, it } from 'vitest'
import { parseApp, parsePayload } from '../features/nuxt/parse'
import { PayloadTag, unwrap } from '../features/nuxt/types'

function app(inline: string, external?: string): CollectedApp {
  return { id: 'app', label: '测试应用', serverRendered: true, externalUrl: external === undefined ? null : 'https://example.com/_payload.json', sources: [
    { kind: 'inline', text: inline, bytes: inline.length, url: 'https://example.com', fetchedAt: 0 },
    ...(external === undefined ? [] : [{ kind: 'external' as const, text: external, bytes: external.length, url: 'https://example.com/_payload.json', fetchedAt: 1 }]),
  ] }
}
describe('固定 Nuxt 版本的序列化兼容性', () => {
  for (const version of ['3.17.5', '4.0.0']) {
    it(`还原 Nuxt ${version} 的特殊类型和引用`, () => {
      const text = readFileSync(new URL(`./fixtures/nuxt/nuxt-${version}.json`, import.meta.url), 'utf8')
      const result = parseApp(app(text))
      expect(result.status).toBe('ready')
      const data = unwrap(result.payload!.data) as Record<string, unknown>
      const sample = unwrap(data.sample) as Record<string, any>
      expect(sample.title).toBe(`Nuxt ${version}`)
      expect(sample.tags).toEqual(new Set(['a']))
      expect(sample.map).toEqual(new Map([['key', 2]]))
      expect(sample.date).toBeInstanceOf(Date)
      expect(sample.pattern).toEqual(/nuxt/gi)
      expect(sample.amount).toBe(99n)
      expect(sample.nan).toBeNaN()
      expect(sample.infinity).toBe(Infinity)
      expect(Object.is(sample.minusZero, -0)).toBe(true)
      expect(sample.cyclic.self).toBe(sample.cyclic)
      expect(sample.shared).toBe(sample.cyclic)
      expect((result.payload!.falsy as unknown[]).map(unwrap)).toEqual([false, 0, '', null, undefined, 0n])
      expect(result.payload!.once).toEqual(new Set())
    })
  }
})
describe('来源与诊断', () => {
  it('外部数据浅覆盖内嵌字段，同时保留其他字段和两份原文', () => {
    const input = app(stringify({ data: { old: 1 }, state: { retained: true } }), stringify({ data: { latest: 2 } }))
    const result = parseApp(input)
    expect(result.payload).toEqual({ data: { latest: 2 }, state: { retained: true } })
    expect(result.app.sources).toEqual(input.sources)
  })
  it('外部请求失败时保留可用的内嵌内容', () => {
    const input = app(stringify({ state: { count: 1 } }), '')
    input.sources[1]!.text = null
    input.sources[1]!.error = 'HTTP 404'
    const result = parseApp(input)
    expect(result.status).toBe('partial')
    expect(result.payload?.state).toEqual({ count: 1 })
    expect(result.diagnostics.join()).toContain('404')
  })
  it('未知类型保留标签与序列化值，不直接解包成原始值', () => {
    const result = parseApp(app('[{"data":1},{"custom":2},["Money",3],{"amount":4},100]'))
    expect(result.status).toBe('partial')
    expect((result.payload!.data as any).custom).toEqual(new PayloadTag('Money', { amount: 100 }, true))
    expect(result.diagnostics.join()).toContain('Money')
  })
  it.each(['broken', '[]', '{}', '[1]', '[["Ref",0]]', '[{"data":99}]'])('无效输入不会抛出到界面：%s', (text) => {
    const result = parseApp(app(text))
    expect(result.status).toBe('error')
    expect(result.payload).toBeNull()
    expect(result.app.sources[0]?.text).toBe(text)
  })
  it('区分空 data 和空的节点文本', () => {
    expect(parseApp(app(stringify({ data: {} }))).status).toBe('ready')
    expect(parseApp(app('')).status).toBe('error')
  })
  it('对象原型字段不能污染扩展对象', () => {
    const result = parseApp(app('[{"__proto__":1},{"polluted":2},true]'))
    expect(result.status).toBe('error')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
  it('保留负索引特殊值与数组空洞', () => {
    const result = parsePayload('[[1,-2,-1,-3,-4,-5,-6],"a"]').value as unknown[]
    expect(result.length).toBe(7)
    expect(1 in result).toBe(false)
    expect(2 in result).toBe(true)
    expect(result[3]).toBeNaN()
    expect(result[4]).toBe(Infinity)
    expect(result[5]).toBe(-Infinity)
    expect(Object.is(result[6], -0)).toBe(true)
  })
})

it('保留 NuxtError 的错误字段和包装根节点的自引用', () => {
  const error = parseApp(app('[{"_errors":1},{"sample":2},["NuxtError",3],{"statusCode":4,"message":5},500,"测试错误"]'))
  const wrapped = (error.payload!._errors as Record<string, unknown>).sample as PayloadTag
  expect(wrapped.type).toBe('NuxtError')
  expect(wrapped.value).toEqual({ statusCode: 500, message: '测试错误' })
  const cyclic = parseApp(app('[["Reactive",1],{"self":0}]'))
  expect(unwrap(cyclic.payload!.self)).toBe(cyclic.payload)
})
