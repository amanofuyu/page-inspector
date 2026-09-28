import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { collectNuxtPayload } from '../features/nuxt/collect'

function collect(nodes: unknown[], limit = 10000) {
  const context = { TextEncoder, URL, location: { href: 'https://example.com/current' }, performance: { getEntriesByType: () => [{ name: 'https://example.com/initial' }] }, document: { title: '测试页面', baseURI: 'https://example.com/current', querySelectorAll: () => nodes } }
  return vm.runInNewContext(`(${collectNuxtPayload.toString()})( ${limit}, 16)`, context)
}
describe('可独立注入的采集函数', () => {
  it('不依赖外部闭包，保留初始地址、多应用和相对来源', () => {
    const result = collect([
      { id: '__NUXT_DATA__', dataset: { ssr: 'true', src: './_payload.json' }, textContent: '[{}]' },
      { id: '', dataset: { nuxtData: 'app-b', ssr: 'false' }, textContent: '[{"data":1},{}]' },
    ])
    expect(result.initialUrl).toBe('https://example.com/initial')
    expect(result.pageUrl).toBe('https://example.com/current')
    expect(result.apps).toHaveLength(2)
    expect(result.apps[0].externalUrl).toBe('https://example.com/_payload.json')
    expect(result.apps[1].serverRendered).toBe(false)
  })
  it('无数据与体积超限有不同结果，超限文本不返回', () => {
    expect(collect([]).apps).toEqual([])
    const result = collect([{ id: 'a', dataset: {}, textContent: 'x'.repeat(100) }], 20)
    expect(result.apps[0].sources[0].text).toBeNull()
    expect(result.apps[0].sources[0].error).toContain('体积')
  })
})

it('错误的外部地址不会使其他应用与内嵌内容丢失', () => {
  const result = collect([{ id: 'app', dataset: { src: 'http://[' }, textContent: '[{}]' }])
  expect(result.apps[0].sources[0].text).toBe('[{}]')
  expect(result.apps[0].sources[1].error).toContain('地址格式')
})
