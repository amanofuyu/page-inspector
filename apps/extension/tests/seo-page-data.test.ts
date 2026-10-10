// @vitest-environment happy-dom
import type { SeoHtmlInput } from '../features/seo/model'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectSeoDom } from '../features/seo/collect-dom'
import { SEO_LIMITS } from '../features/seo/model'
import { buildSeoSnapshot } from '../features/seo/normalize'
import { safeSeoUrl } from '../features/seo/page-data'
import { parseSeoHtml } from '../features/seo/parse-html'
import { headingText, imageCsv, linkCsv, socialPreviews } from '../features/seo/presentation'
import { seoToolLinks } from '../features/seo/tools'

const url = 'https://example.com/page'
const identity = { tabId: 1, documentId: '文档', url, initialUrl: url, navigationStart: 1 }
function html(text: string, overrides: Partial<SeoHtmlInput> = {}) {
  return parseSeoHtml({ text, url, identity, source: 'navigation-response', status: 200, headers: [], sampledAt: 1, ...overrides })
}
function dom(text: string, limits = SEO_LIMITS) {
  vi.stubGlobal('location', new URL(url))
  document.documentElement.innerHTML = text
  for (const image of document.querySelectorAll('img'))
    Object.defineProperty(image, 'currentSrc', { configurable: true, value: '' })
  const raw = collectSeoDom(limits)
  return buildSeoSnapshot(raw, { identity, source: 'live-dom' })
}
afterEach(() => {
  document.documentElement.innerHTML = '<head></head><body></body>'
  vi.unstubAllGlobals()
})

describe('页面 SEO 查看能力的 DOM 与 HTML 一致性', () => {
  it('保留六级标题顺序，正文按块边界计数，忽略脚本、模板和 hidden 正文', () => {
    const text = '<head><title>页面标题</title></head><body><h1>One <b>two</b></h1><h2>Three</h2><h3>Four</h3><h4>Five</h4><h5>Six</h5><h6>Seven</h6><p>eight<br>nine</p><script>ignore these words</script><style>body { color: red; }</style><template><h1>模板</h1></template><div hidden>hidden words</div></body>'
    for (const result of [html(text), dom(text)]) {
      expect(result.fields.filter(field => field.group === 'headings').map(field => field.label)).toEqual(['H1', 'H2', 'H3', 'H4', 'H5', 'H6'])
      expect(result.page?.wordCount).toBe(9)
      expect(headingText(result.fields)).toContain('H6: Seven')
    }
  })

  it('尊重 base 地址，保留重复、空属性、其他协议和 rel，安全打开仅接受 HTTP(S)', () => {
    const text = '<head><base href="https://cdn.example.net/assets/"></head><body><a href="one" rel="NOFOLLOW sponsored ugc">一</a><a href="https://example.com:8443/two">二</a><a href="one">重复</a><a href="mailto:user@example.com">邮箱</a><a href="javascript:alert(1)">脚本地址</a><a>无地址</a><img src="image.png" alt="" width="320" height="240"><img src="/logo.png" alt="标志" title="标题"><img></body>'
    for (const result of [html(text), dom(text)]) {
      expect(result.page?.links).toHaveLength(6)
      expect(result.page?.links.map(link => link.kind)).toEqual(['external', 'internal', 'external', 'other', 'other', 'other'])
      expect(result.page?.links[0]?.url).toBe('https://cdn.example.net/assets/one')
      expect(result.page?.links[0]?.rel).toEqual(['nofollow', 'sponsored', 'ugc'])
      expect(result.page?.images[0]?.alt).toBe('')
      expect(result.page?.images[2]?.alt).toBeNull()
      expect(result.page?.images[0]?.url).toBe('https://cdn.example.net/assets/image.png')
      expect(safeSeoUrl(result.page?.links[4]?.url)).toBe('')
      expect(result.page?.images[0]?.width).toBe('320')
    }
  })

  it('微数据支持嵌套对象、重复属性、多属性、相对 URL、时间和 itemref，普通 id 不生成字段', () => {
    const text = '<head><base href="/assets/"></head><body><div id="app"><div itemscope itemtype="https://schema.org/Person" itemid="/person" itemref="extra"><span itemprop="name alternateName">小明</span><span itemprop="name">第二个名字</span><div itemprop="worksFor" itemscope itemtype="https://schema.org/Organization"><span itemprop="name">公司</span></div><img itemprop="image" src="person.png"><time itemprop="birthDate" datetime="2000-01-01">生日</time><data itemprop="code" value="001">一</data></div></div><div id="extra"><a itemprop="url" href="/about">介绍</a></div></body>'
    for (const result of [html(text), dom(text)]) {
      const fields = result.fields.filter(field => field.key === 'microdata')
      expect(fields).toHaveLength(1)
      const value = JSON.parse(fields[0]!.value)
      expect(value.id).toBe('https://example.com/person')
      expect(value.properties.name).toEqual(['小明', '第二个名字'])
      expect(value.properties.alternateName).toEqual(['小明'])
      expect(value.properties.worksFor[0].properties.name).toEqual(['公司'])
      expect(value.properties.image).toEqual(['https://example.com/assets/person.png'])
      expect(value.properties.birthDate).toEqual(['2000-01-01'])
      expect(value.properties.code).toEqual(['001'])
      expect(value.properties.url).toEqual(['https://example.com/about'])
      expect(result.complete).toBe(true)
    }
  })

  it('循环 itemref 和采集预算会标记部分结果，普通大容器不影响完整性', () => {
    const cycle = html('<section itemscope><div itemscope id="a" itemprop="child" itemref="b"><span itemprop="name">甲</span></div></section><div id="b" itemprop="loop" itemscope itemref="a"></div>')
    expect(cycle.complete).toBe(false)
    expect(cycle.fields.find(field => field.key === 'microdata')?.truncated).toBe(true)
    const plain = dom(`<body><div id="app">${'x '.repeat(10000)}</div></body>`)
    expect(plain.complete).toBe(true)
    const limited = dom('<body><h1>标题</h1><a href="/one">一</a><a href="/two">二</a></body>', { ...SEO_LIMITS, records: 2 })
    expect(limited.complete).toBe(false)
    expect(limited.reasons.some(reason => reason.includes('数量'))).toBe(true)
  })

  it('社交卡片解析相对图片并按 Twitter 到 Open Graph 的顺序回退，导出保留原文并阻止公式', () => {
    const result = html('<base href="/assets/"><meta property="og:title" content="OG 标题"><meta property="og:image" content="cover.jpg"><meta property="og:description" content="描述"><meta name="twitter:title" content="推文标题"><body><a href="/one" title="a,b">=SUM(1,2)</a><img src="logo.png" alt="引号&quot;与换行&#10;内容"></body>')
    const before = JSON.stringify(result)
    const previews = socialPreviews(result)
    expect(previews[1]?.title).toBe('推文标题')
    expect(previews[1]?.image).toBe('https://example.com/assets/cover.jpg')
    expect(linkCsv(result.page!.links)).toContain('\'=SUM(1,2)')
    expect(imageCsv(result.page!.images)).toContain('引号""与换行\n内容')
    expect(JSON.stringify(result)).toBe(before)
  })
  it('外部工具完整编码页面查询参数，不混入目标服务参数', () => {
    const page = 'https://example.com/page?x=1&other=中文#section'
    const tools = seoToolLinks(page)
    const speed = new URL(tools.find(tool => tool.label === 'PageSpeed Insights')!.url)
    expect(speed.searchParams.get('url')).toBe(page)
    expect(speed.searchParams.get('other')).toBeNull()
    expect(tools.every(tool => safeSeoUrl(tool.url))).toBe(true)
  })
  it('消息预算在写入标签前检查，Microdata 重复保存也不会绕过上限', () => {
    dom(`<body><div itemscope><span itemprop="name">${'文本'.repeat(3000)}</span></div></body>`)
    const raw = collectSeoDom({ ...SEO_LIMITS, textBytes: 4096 })
    expect(raw.complete).toBe(false)
    expect(raw.reasons.some(reason => reason.includes('消息预算'))).toBe(true)
    expect(new TextEncoder().encode(JSON.stringify(raw)).byteLength).toBeLessThanOrEqual(4096)
  })
})
