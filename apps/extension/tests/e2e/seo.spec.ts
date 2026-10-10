import { clickText, expect, fillField, test } from './fixtures'

test.use({ targetUrl: 'http://127.0.0.1:4318/seo', expectedText: '未检测到 Nuxt 数据' })

test('普通页面可查看 DOM 字段、筛选及复制，侧边栏不重新请求 HTML', async ({ extension }) => {
  const { panel, website } = extension
  await expect(website).toHaveTitle('SEO 客户端标题')
  await clickText(panel, 'SEO', '.workspace-tabs')
  await expect.poll(() => panel.evaluate(() => document.querySelector('[data-key="title"]')?.textContent)).toContain('SEO 客户端标题')
  expect(await panel.evaluate(() => [...document.querySelectorAll('.workspace-tabs [role="tab"]')].map(tab => tab.textContent?.trim()))).toEqual(['数据', 'SEO'])
  expect(await panel.evaluate(() => document.querySelector('[data-change]'))).toBeNull()
  await panel.click('[data-key="title"] > .ui-disclosure-trigger')
  await panel.click('[aria-label="复制 DOM title"]')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.toast-message')?.textContent)).toContain('已复制 SEO 数据')
  await clickText(panel, '标题', '.seo-sections')
  expect(await panel.evaluate(() => [...document.querySelectorAll('[data-key^="heading:"]')].map(row => row.getAttribute('data-key')))).toContain('heading:h1')
  await clickText(panel, '结构化数据', '.seo-sections')
  await fillField(panel, '[aria-label="筛选 SEO 字段名称或值"]', 'JSON-LD')
  await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.seo-row').length)).toBeGreaterThan(0)
  await panel.select('[aria-label="SEO 数据来源"]', 'html')
  await expect.poll(() => panel.text()).toContain('HTML 正文仅在 DevTools 中读取')
  await panel.select('[aria-label="SEO 数据来源"]', 'dom')
  await clickText(panel, '概览', '.seo-sections')
  await fillField(panel, '[aria-label="筛选 SEO 字段名称或值"]', 'title')
  await website.evaluate(() => {
    document.title = '更新后的 DOM 标题'
  })
  await clickText(panel, '重新读取 DOM')
  await expect.poll(() => panel.evaluate(() => document.querySelector('[data-key="title"]')?.textContent)).toContain('更新后的 DOM 标题')
  expect(panel.exceptions).toEqual([])
})
