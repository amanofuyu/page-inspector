import { clickText, expect, fillField, test } from '../e2e/fixtures'

test('真实 Nuxt SEO：查看水合后的 DOM 字段及纯 CSR 页面', async ({ extension }, testInfo) => {
  const { website, panel } = extension
  const { base } = testInfo.project.metadata
  await website.goto(`${base}seo`)
  await expect(website.locator('[data-testid="seo-fixture"]')).toContainText('已水合')
  await expect(website).toHaveTitle('SEO 客户端标题')
  await clickText(panel, 'SEO', '.workspace-tabs')
  await expect.poll(() => panel.evaluate(() => document.querySelector('[data-key="title"]')?.textContent)).toContain('SEO 客户端标题')
  await clickText(panel, '结构化数据', '.seo-sections')
  await fillField(panel, '[aria-label="筛选 SEO 字段名称或值"]', 'JSON-LD')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.seo-row')?.textContent)).toContain('Article')
  await website.goto(`${base}csr`)
  await expect(website).toHaveTitle('纯 CSR SEO 标题')
  await expect.poll(() => panel.evaluate(() => !!document.querySelector('[aria-label="筛选 SEO 字段名称或值"]'))).toBe(true)
  await clickText(panel, '概览', '.seo-sections')
  await fillField(panel, '[aria-label="筛选 SEO 字段名称或值"]', 'title')
  await clickText(panel, '重新读取 DOM')
  await expect.poll(() => panel.evaluate(() => document.querySelector('[data-key="title"]')?.textContent)).toContain('纯 CSR SEO 标题')
  expect(await panel.evaluate(() => document.querySelector('[data-change]'))).toBeNull()
})
