// @vitest-environment happy-dom
import type { SeoSnapshot } from '../features/seo/model'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseSeoHtml } from '../features/seo/parse-html'
import SeoView from '../features/seo/SeoView.vue'

const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})
function setup() {
  const dom: SeoSnapshot = parseSeoHtml({ text: '<title>测试页面</title><meta name="description" content="测试描述">', url: 'https://example.com/', identity: { tabId: 1, documentId: '文档', url: 'https://example.com/', initialUrl: 'https://example.com/', navigationStart: 1 }, source: 'navigation-response', association: 'matched', status: 200, headers: [], sampledAt: 1 })
  dom.source = 'live-dom'
  const wrapper = mount(SeoView, { attachTo: document.body, props: { active: true, dom, html: null, status: 'ready', error: '', sourceNotice: '', canCapture: false } })
  wrappers.push(wrapper)
  return { wrapper, dom }
}

describe('sEO 参考视图的数据与事件契约', () => {
  it('读取和导出只上报意图，忙碌状态完全服从容器输入', async () => {
    const { wrapper } = setup()
    const refresh = wrapper.findAll('.seo-actions button').find(button => button.text() === '重新读取 SEO')!
    await refresh.trigger('click')
    expect(wrapper.emitted('refresh')).toEqual([['dom']])
    expect(refresh.attributes('disabled')).toBeUndefined()
    await wrapper.setProps({ status: 'loading' })
    expect(refresh.attributes('disabled')).toBeDefined()
    const cancel = wrapper.findAll('.seo-actions button').find(button => button.text() === '取消读取')!
    await cancel.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    await wrapper.findAll('.seo-export button')[0]!.trigger('click')
    expect(wrapper.emitted('export')).toEqual([['json']])
  })

  it('复制从当前行发出完整原文，切换工作区可见性保留组件筛选状态', async () => {
    const { wrapper, dom } = setup()
    const original = JSON.stringify(dom)
    await wrapper.get('[data-key="title"] > .ui-disclosure-trigger').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[aria-label="复制 DOM title"]').exists()).toBe(true))
    await wrapper.get('[aria-label="复制 DOM title"]').trigger('click')
    expect(wrapper.emitted('copy')).toEqual([[dom.fields.find(field => field.key === 'title')!.snippet]])
    await wrapper.get('[aria-label="搜索 SEO 字段"]').setValue('description')
    await vi.waitFor(() => expect(wrapper.findAll('.seo-row')).toHaveLength(1))
    await wrapper.setProps({ active: false })
    await wrapper.setProps({ active: true })
    expect((wrapper.get('[aria-label="搜索 SEO 字段"]').element as HTMLInputElement).value).toBe('description')
    expect(JSON.stringify(dom)).toBe(original)
    expect(wrapper.emitted('refresh')).toBeUndefined()
  })
})
