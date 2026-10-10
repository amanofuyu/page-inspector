// @vitest-environment happy-dom
import type { SeoSnapshot } from '../features/seo/model'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SeoFieldRow from '../features/seo/components/SeoFieldRow.vue'
import { parseSeoHtml } from '../features/seo/parse-html'
import SeoView from '../features/seo/SeoView.vue'

const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})
function setup(text = '<title>测试页面</title><meta name="description" content="测试描述">') {
  const dom: SeoSnapshot = parseSeoHtml({ text, url: 'https://example.com/', identity: { tabId: 1, documentId: '文档', url: 'https://example.com/', initialUrl: 'https://example.com/', navigationStart: 1 }, source: 'navigation-response', status: 200, headers: [], sampledAt: 1 })
  dom.source = 'live-dom'
  const wrapper = mount(SeoView, { attachTo: document.body, props: { active: true, dom, html: null, status: 'ready', error: '', sourceNotice: '', canReadHtml: false } })
  wrappers.push(wrapper)
  return { wrapper, dom }
}
async function section(wrapper: ReturnType<typeof mount>, label: string) {
  await wrapper.findAll('.seo-sections [role="tab"]').find(tab => tab.text() === label)!.trigger('click')
  await vi.waitFor(() => expect(wrapper.findAll('.seo-sections [role="tab"]').find(tab => tab.text() === label)!.attributes('aria-selected')).toBe('true'))
}
async function source(wrapper: ReturnType<typeof mount>, value: 'dom' | 'html') {
  await wrapper.get('[aria-label="SEO 数据来源"]').trigger('click')
  await vi.waitFor(() => expect(document.querySelector(`[role="option"][data-option-value="${value}"]`)).not.toBeNull())
  document.querySelector<HTMLElement>(`[role="option"][data-option-value="${value}"]`)!.click()
  await vi.waitFor(() => expect(wrapper.get('[aria-label="SEO 数据来源"]').attributes('data-value')).toBe(value))
}

describe('sEO 参考视图的数据与事件契约', () => {
  it('读取只上报意图，忙碌状态完全服从容器输入', async () => {
    const { wrapper } = setup()
    const refresh = wrapper.findAll('.seo-actions button').find(button => button.text() === '重新读取 DOM')!
    await refresh.trigger('click')
    expect(wrapper.emitted('refresh')).toEqual([['dom']])
    expect(refresh.attributes('disabled')).toBeUndefined()
    await wrapper.setProps({ status: 'loading' })
    expect(refresh.attributes('disabled')).toBeDefined()
    const cancel = wrapper.findAll('.seo-actions button').find(button => button.text() === '取消读取')!
    await cancel.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.find('.seo-export').exists()).toBe(false)
    expect(wrapper.find('[data-change]').exists()).toBe(false)
  })

  it('来源选择器切换已有快照，HTML 读取仍需手动操作，工作区只保留分类页签', async () => {
    const { wrapper, dom } = setup()
    expect(wrapper.findAll('[role="tablist"]')).toHaveLength(1)
    await source(wrapper, 'html')
    expect(wrapper.text()).toContain('HTML 正文仅在 DevTools 中读取')
    expect(wrapper.find('[data-key="title"]').exists()).toBe(false)
    expect(wrapper.emitted('refresh')).toBeUndefined()
    const html = parseSeoHtml({ text: '<title>HTML 标题</title>', url: dom.url, identity: dom.identity, source: 'navigation-response', status: 200, headers: [], sampledAt: 2 })
    const before = JSON.stringify({ dom, html })
    await wrapper.setProps({ html, canReadHtml: true })
    expect(wrapper.get('[data-key="title"]').text()).toContain('HTML 标题')
    await wrapper.findAll('.seo-actions button').find(button => button.text() === '读取 HTML')!.trigger('click')
    expect(wrapper.emitted('refresh')).toEqual([['html']])
    await source(wrapper, 'dom')
    expect(wrapper.get('[data-key="title"]').text()).toContain('测试页面')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(JSON.stringify({ dom, html })).toBe(before)
    await wrapper.get('[aria-label="SEO 数据来源"]').trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull())
    await wrapper.setProps({ active: false })
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).toBeNull())
  })

  it('复制从当前行发出完整原文，切换工作区可见性保留组件筛选状态', async () => {
    const { wrapper, dom } = setup()
    const original = JSON.stringify(dom)
    await wrapper.get('[data-key="title"] > .ui-disclosure-trigger').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[aria-label="复制 DOM title"]').exists()).toBe(true))
    await wrapper.get('[aria-label="复制 DOM title"]').trigger('click')
    expect(wrapper.emitted('copy')).toEqual([[dom.fields.find(field => field.key === 'title')!.snippet]])
    await wrapper.get('[aria-label="筛选 SEO 字段名称或值"]').setValue('description')
    await vi.waitFor(() => expect(wrapper.findAll('.seo-row')).toHaveLength(1))
    await wrapper.setProps({ active: false })
    await wrapper.setProps({ active: true })
    expect((wrapper.get('[aria-label="筛选 SEO 字段名称或值"]').element as HTMLInputElement).value).toBe('description')
    expect(JSON.stringify(dom)).toBe(original)
    expect(wrapper.emitted('refresh')).toBeUndefined()
  })

  it('六个分类分别展示数据，复制标题和导出结构化数据保留原文精度', async () => {
    const json = '{"@type":"Article","large":9007199254740993}'
    const { wrapper, dom } = setup(`<title>页面</title><meta property="og:title" content="分享标题"><script type="application/ld+json">${json}</script><body><h1>一级</h1><h3>三级</h3></body>`)
    const before = JSON.stringify(dom)
    expect(wrapper.findAll('.seo-sections [role="tab"]').map(tab => tab.text())).toEqual(['概览', '标题', '链接', '图片', '结构化数据', '社交分享', '工具'])
    await section(wrapper, '标题')
    await vi.waitFor(() => expect(wrapper.findAll('.seo-row')).toHaveLength(2))
    await wrapper.findAll('button').find(button => button.text() === '复制全部标题')!.trigger('click')
    expect(wrapper.emitted('copy')?.at(-1)).toEqual(['H1: 一级\nH3: 三级'])
    await section(wrapper, '结构化数据')
    await vi.waitFor(() => expect(wrapper.findAll('.seo-row')).toHaveLength(1))
    await wrapper.findAll('button').find(button => button.text() === '导出当前结构化数据 JSON')!.trigger('click')
    const exported = wrapper.emitted('download')!.at(-1)!
    expect(JSON.parse(exported[0] as string)[0].value).toBe(json)
    await section(wrapper, '社交分享')
    expect(wrapper.find('.seo-social-previews').text()).toContain('分享标题')
    expect(wrapper.emitted('refresh')).toBeUndefined()
    expect(JSON.stringify(dom)).toBe(before)
    await section(wrapper, '工具')
    expect(wrapper.find('.seo-tools').text()).toContain('PageSpeed Insights')
  })

  it('折叠 JSON-LD 时只显示标题与字符数，展开代码高亮且复制保留完整原文', async () => {
    const json = '{"@context":"https://schema.org","@type":"Article","name":"一","name":"二","large":9007199254740993,"text":"<img src=x onerror=alert(1)>"}'
    const { wrapper, dom } = setup(`<script type="application/ld+json">${json}</script>`)
    const original = JSON.stringify(dom)
    await section(wrapper, '结构化数据')
    expect(wrapper.get('[data-key="jsonld"]').text()).toContain('JSON-LD · Article')
    expect(wrapper.get('[data-key="jsonld"]').text()).toContain(`${json.length} 字符`)
    expect(wrapper.find('[data-key="jsonld"] .ui-json-code').exists()).toBe(false)
    expect(wrapper.find('[data-key="jsonld"] .seo-values').exists()).toBe(false)
    await wrapper.get('[data-key="jsonld"] > .ui-disclosure-trigger').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.seo-field-detail .shiki').exists()).toBe(true))
    expect(wrapper.find('.seo-json-summary').exists()).toBe(false)
    expect(wrapper.get('.seo-field-detail code').text()).toContain('9007199254740993')
    expect(wrapper.get('.seo-field-detail code').text().match(/"name"/g)).toHaveLength(2)
    expect(wrapper.findAll('.seo-field-detail img')).toHaveLength(0)
    await wrapper.get('[aria-label="复制 DOM JSON-LD 原文"]').trigger('click')
    expect(wrapper.emitted('copy')!.at(-1)).toEqual([json])
    const field = dom.fields.find(field => field.key === 'jsonld')!
    await wrapper.get(`[aria-label="复制 DOM ${field.label}"]`).trigger('click')
    expect(wrapper.emitted('copy')!.at(-1)).toEqual([field.snippet])
    await wrapper.get('[data-key="jsonld"] > .ui-disclosure-trigger').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-key="jsonld"] .ui-json-code').exists()).toBe(false))
    expect(wrapper.get('[data-key="jsonld"]').text()).not.toContain('schema.org')
    expect(JSON.stringify(dom)).toBe(original)
  })

  it('语法错误可查看高亮原文，超长 JSON-LD 预览有上限且复制包含完整内容', async () => {
    const broken = setup('<script type="application/ld+json">{"bad"}</script>')
    await section(broken.wrapper, '结构化数据')
    await broken.wrapper.get('[data-key="jsonld"] > .ui-disclosure-trigger').trigger('click')
    await vi.waitFor(() => expect(broken.wrapper.find('.seo-field-detail .shiki').exists()).toBe(true))
    expect(broken.wrapper.get('.seo-field-detail').text()).toContain('JSON 无法解析')
    expect(broken.wrapper.get('.seo-field-detail code').text()).toBe('{"bad"}')
    const json = `{"@type":"Article","text":"${'内容'.repeat(12000)}"}`
    const { wrapper } = setup(`<script type="application/ld+json">${json}</script>`)
    await section(wrapper, '结构化数据')
    await wrapper.get('[data-key="jsonld"] > .ui-disclosure-trigger').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.seo-field-detail .shiki').exists()).toBe(true))
    expect(wrapper.get('.seo-field-detail code').text()).toHaveLength(16000)
    expect(wrapper.get('.seo-field-detail').text()).toContain('仅预览前 16,000 字符')
    await wrapper.get('[aria-label="复制 DOM JSON-LD 原文"]').trigger('click')
    expect(wrapper.emitted('copy')!.at(-1)).toEqual([json])
    const field = wrapper.getComponent(SeoFieldRow).props('field')
    await wrapper.setProps({ dom: { ...wrapper.props('dom')!, fields: [{ ...field, truncated: true }] } })
    expect(wrapper.get('.seo-field-detail').text()).toContain('该字段达到读取上限')
  })

  it('链接首屏只渲染 50 条，导出包含全部匹配项，切换图片不会复用链接筛选', async () => {
    const { wrapper } = setup(`<title>页面</title><body>${Array.from({ length: 57 }, (_, index) => `<a href="/link-${index}">链接 ${index}</a>`).join('')}<img src="logo.png" alt="标志"><img src="decoration.png" alt=""></body>`)
    await section(wrapper, '链接')
    expect(wrapper.findAll('.seo-link-item')).toHaveLength(50)
    await wrapper.findAll('button').find(button => button.text() === '导出明细 CSV')!.trigger('click')
    expect(wrapper.emitted('download')!.at(-1)![0]).toContain('/link-56')
    await wrapper.findAll('button').find(button => button.text() === '再显示 50 项')!.trigger('click')
    expect(wrapper.findAll('.seo-link-item')).toHaveLength(57)
    await section(wrapper, '图片')
    expect(wrapper.findAll('.seo-image-item')).toHaveLength(2)
    expect(wrapper.text()).toContain('空 alt（可能为装饰性图片）')
    await wrapper.get('.seo-image-item [aria-label="复制图片地址"]').trigger('click')
    expect(wrapper.emitted('copy')!.at(-1)).toEqual(['https://example.com/logo.png'])
  })

  it('图片加载失败显示占位，切换地址后恢复预览并保持完整地址复制', async () => {
    const { wrapper, dom } = setup('<body><img src="logo.png" alt="标志" width="320" height="240"><img src="javascript:alert(1)"><img></body>')
    const original = JSON.stringify(dom)
    await section(wrapper, '图片')
    const card = wrapper.findAll('.seo-image-item')[0]!
    const previous = card.get('img')
    await previous.trigger('error')
    expect(card.find('img').exists()).toBe(false)
    expect(card.get('.seo-thumbnail-placeholder').text()).toContain('图片加载失败')
    await card.get('[aria-label="复制图片地址"]').trigger('click')
    expect(wrapper.emitted('copy')!.at(-1)).toEqual(['https://example.com/logo.png'])
    const unsupported = wrapper.findAll('.seo-image-item')[1]!
    expect(unsupported.find('img, a').exists()).toBe(false)
    expect(unsupported.text()).toContain('无预览')
    await unsupported.get('[aria-label="复制图片地址"]').trigger('click')
    expect(wrapper.emitted('copy')!.at(-1)).toEqual(['javascript:alert(1)'])
    expect(wrapper.findAll('.seo-image-item')[2]!.get('[aria-label="复制图片地址"]').attributes('disabled')).toBeDefined()

    const image = { ...dom.page!.images[0]!, src: '/新版标志.png', url: 'https://example.com/%E6%96%B0%E7%89%88%E6%A0%87%E5%BF%97.png?size=large' }
    await wrapper.setProps({ dom: { ...dom, page: { ...dom.page!, images: [image] } } })
    expect(card.get('img').attributes('src')).toBe(image.url)
    expect(card.get('.seo-resource-title').text()).toBe('新版标志.png')
    await previous.trigger('error')
    expect(card.find('img').exists()).toBe(true)
    await card.get('[aria-label="复制图片地址"]').trigger('click')
    expect(wrapper.emitted('copy')!.at(-1)).toEqual([image.url])
    expect(JSON.stringify(dom)).toBe(original)
  })

  it('分组后的结构化字段与社交标签仍可完整查看、筛选和复制', async () => {
    const { wrapper, dom } = setup('<title>页面</title><link rel="alternate" hreflang="en" href="/en"><meta property="og:title" content="OG 标题"><meta name="twitter:title" content="Twitter 标题"><script type="application/ld+json">{"@type":"Article"}</script><body><div itemscope itemtype="https://schema.org/Person"><span itemprop="name">姓名</span></div></body>')
    const before = JSON.stringify(dom)
    await section(wrapper, '结构化数据')
    const expected = dom.fields.filter(field => field.group === 'structured' || field.group === 'languages')
    expect(wrapper.findAll('.seo-row')).toHaveLength(expected.length)
    for (const field of expected)
      expect(wrapper.find(`[data-key="${field.key}"]`).exists()).toBe(true)
    await wrapper.get('[data-key="microdata"] > .ui-disclosure-trigger').trigger('click')
    const microdata = dom.fields.find(field => field.key === 'microdata')!
    await vi.waitFor(() => expect(wrapper.find(`[aria-label="复制 DOM ${microdata.label}"]`).exists()).toBe(true))
    await wrapper.get(`[aria-label="复制 DOM ${microdata.label}"]`).trigger('click')
    expect(wrapper.emitted('copy')!.at(-1)).toEqual([microdata.snippet])
    await section(wrapper, '社交分享')
    expect(wrapper.findAll('.seo-row')).toHaveLength(2)
    await wrapper.get('[aria-label="筛选 SEO 字段名称或值"]').setValue('Twitter 标题')
    await vi.waitFor(() => expect(wrapper.findAll('.seo-row')).toHaveLength(1))
    expect(wrapper.get('.seo-row').attributes('data-key')).toBe('meta:twitter:title')
    expect(JSON.stringify(dom)).toBe(before)
  })
})
