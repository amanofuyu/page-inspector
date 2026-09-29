import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '../e2e/fixtures'

test('生产应用水合、业务数据和特殊类型', async ({ extension }, testInfo) => {
  const { website, panel } = extension
  const { base, major } = testInfo.project.metadata
  await expect(website.locator('main')).toHaveAttribute('data-hydrated', 'true')
  await expect(website.locator('[data-testid="business-data"]')).toContainText(`nuxt${major}-basic`)
  await panel.search(`nuxt${major}-basic`)
  await expect.poll(() => panel.text()).toContain('1 条匹配')
  await website.goto(`${base}types`)
  await expect(website.locator('[data-testid="types-ready"]')).toContainText('2026-01-01T00:00:00.000Z')
  await expect.poll(() => panel.text()).toContain('special-types')
  await panel.click('[aria-label="展开 special-types"]')
  for (const value of ['Date', 'Set', 'Map', '99n', 'RegExp', 'NaN', 'Infinity', '-0'])
    await expect.poll(() => panel.text()).toContain(value)
  await website.goto(`${base}custom`)
  await expect(website.locator('main')).toHaveAttribute('data-hydrated', 'true')
  await expect.poll(() => panel.text()).toContain('Money')
  await expect.poll(() => panel.text()).toContain('仅展示序列化内容')
})

test('初始状态、NuxtLink 导航和整页刷新', async ({ extension }, testInfo) => {
  const { website, panel } = extension
  const { base, major } = testInfo.project.metadata
  await website.goto(`${base}state`)
  await expect(website.locator('[data-testid="counter"]')).toHaveText('7')
  await expect(website.locator('main')).toHaveAttribute('data-hydrated', 'true')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.page-url')?.textContent)).toContain('/state')
  await panel.click('.view-tabs button:nth-child(2)')
  await expect.poll(() => panel.text()).toContain('counter')
  await website.getByRole('button', { name: '增加计数' }).click()
  await expect(website.locator('[data-testid="counter"]')).toHaveText('8')
  await expect.poll(() => panel.evaluate(() => {
    const row = [...document.querySelectorAll('.tree-row')].find(item => item.querySelector('.tree-key')?.textContent?.endsWith('counter'))
    return row?.querySelector('.tree-value')?.textContent
  })).toBe('7')
  await website.goto(`${base}route-a`)
  await panel.click('.view-tabs button:first-child')
  await expect.poll(() => panel.text()).toContain('route-a')
  const initial = await website.evaluate(() => performance.timeOrigin)
  await expect(website.locator('main')).toHaveAttribute('data-hydrated', 'true')
  await website.getByRole('link', { name: 'route-b', exact: true }).click()
  await expect(website.locator('[data-testid="route-marker"]')).toHaveText(`nuxt${major}-route-b`)
  expect(await website.evaluate(() => performance.timeOrigin)).toBe(initial)
  await expect.poll(() => panel.text()).toContain('初始文档快照')
  await website.reload()
  await expect.poll(() => panel.text()).toContain('route-b')
  await expect.poll(() => panel.text()).not.toContain('页面地址已变化')
})

test('实际 payload 来源与原文导出', async ({ extension }, testInfo) => {
  const { website, panel, downloads } = extension
  const { profile, base } = testInfo.project.metadata
  const source = await website.locator('script#__NUXT_DATA__').getAttribute('data-src')
  let original = await website.locator('script#__NUXT_DATA__').textContent()
  if (profile === 'static-external') {
    expect(source).toBeTruthy()
    const url = new URL(source!, website.url())
    expect(url.pathname).toContain('/inspect/basic/')
    const response = await website.request.get(url.href)
    expect(response.ok()).toBe(true)
    original = await response.text()
    expect(original).toContain('sku-001')
    expect(await website.locator('script#__NUXT_DATA__').textContent()).not.toContain('sku-001')
    await panel.search('sku-001')
    await expect.poll(() => panel.text()).toContain('sku-001')
  }
  else { expect(source).toBeNull() }
  await panel.click('.view-tabs button:last-child')
  if (profile === 'static-external')
    await panel.select('[aria-label="原文来源"]', '1')
  await panel.click('.export-button')
  await expect.poll(async () => (await readdir(downloads)).filter(name => name.endsWith('.json')).length).toBe(1)
  const filename = (await readdir(downloads)).find(name => name.endsWith('.json'))!
  expect(await readFile(path.join(downloads, filename), 'utf8')).toBe(original)
  if (profile !== 'ssr')
    expect((await website.request.get(`${base}missing/_payload.json`)).status()).toBe(404)
})

test('真实 payload 的分析、独立索引、关注与成功刷新比较', async ({ extension }, testInfo) => {
  const { clickText, fillField } = await import('../e2e/fixtures')
  const { website, panel } = extension
  const { base, profile, major } = testInfo.project.metadata
  await website.goto(`${base}features`)
  await expect(website.locator('main')).toHaveAttribute('data-hydrated', 'true')
  await expect(website.locator('[data-testid="feature-marker"]')).toContainText(`nuxt${major}-features`)
  await expect.poll(() => panel.text()).toContain('feature-lab')
  await clickText(panel, '分析', '.workspace-tabs')
  await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.ranking-row').length)).toBeGreaterThan(0)
  await clickText(panel, '检索', '.workspace-tabs')
  await fillField(panel, '[aria-label="条件 1 内容"]', 'feature-lab.many.field11999')
  await clickText(panel, '执行查询')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.query-result-status')?.textContent)).toContain('1 条匹配')
  await clickText(panel, '关注', '.workspace-tabs')
  await fillField(panel, '[aria-label="关注路径"]', 'data.feature-lab.watched.price')
  await clickText(panel, '添加关注')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.watch-status')?.textContent)).toBe('首次出现')
  await website.reload()
  await expect.poll(() => panel.evaluate(() => document.querySelector('.watch-status')?.textContent)).toBe('未变化')
  if (profile === 'ssr') {
    await website.goto(`${base}features?version=2`)
    await expect.poll(() => panel.evaluate(() => document.querySelector('.watch-status')?.textContent)).toBe('类型变化')
    await website.goto(`${base}features?version=3`)
    await expect.poll(() => panel.evaluate(() => document.querySelector('.watch-status')?.textContent)).toBe('缺失')
  }
})
