import type { WatchRule } from '../../features/watch/model'
import { Buffer } from 'node:buffer'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { clickText, expect, fillField, test } from './fixtures'

const base = 'http://127.0.0.1:4318'
test('独立索引查询、局部子树、关注刷新与规则持久化', async ({ extension }, testInfo) => {
  const { panel, website } = extension
  await website.goto(`${base}/features?version=1`)
  await expect.poll(() => panel.text()).toContain('feature-lab')
  await clickText(panel, '检索', '.workspace-tabs')
  await expect.poll(() => panel.evaluate(() => document.querySelector('[aria-label="扩展工作区"] > [role="status"]')?.textContent)).toContain('完整')
  await fillField(panel, '[aria-label="条件 1 内容"]', 'feature-lab.many.field11999')
  await clickText(panel, '执行查询')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.query-result-status')?.textContent)).toContain('1 条匹配')
  await panel.click('.query-result .path-button')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.field-detail')?.textContent)).toContain('11999')
  await fillField(panel, '[aria-label="查询名称"]', '远端字段')
  await clickText(panel, '收藏条件')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.favorite-row')?.textContent)).toContain('远端字段')
  await clickText(panel, '关注', '.workspace-tabs')
  await fillField(panel, '[aria-label="关注路径"]', 'data.feature-lab.watched.price')
  await fillField(panel, '[aria-label="关注别名"]', '商品价格')
  await clickText(panel, '添加关注')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.watch-status')?.textContent)).toBe('首次出现')
  await website.goto(`${base}/features?version=2`)
  await expect.poll(() => panel.evaluate(() => document.querySelector('.watch-status')?.textContent)).toBe('类型变化')
  await website.goto(`${base}/features?version=3`)
  await expect.poll(() => panel.evaluate(() => document.querySelector('.watch-status')?.textContent)).toBe('缺失')
  const saved = await panel.evaluate(async () => Object.entries(await chrome.storage.local.get(null)).filter(([key]) => key.startsWith('inspector-definition/')).map(([, value]) => value))
  expect(saved).toHaveLength(2)
  expect(JSON.stringify(saved)).not.toContain('canonical')
  expect(JSON.stringify(saved)).not.toContain('previous')
  const image = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
  await writeFile(testInfo.outputPath('feature-watches.png'), Buffer.from(image.data, 'base64'))
  expect(await panel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('分析来源、条目就地展开、无业务值报告和取消后重建', async ({ extension }, testInfo) => {
  const { panel, website, downloads } = extension
  await website.goto(`${base}/features?version=1`)
  await expect.poll(() => panel.text()).toContain('feature-lab')
  await clickText(panel, '分析', '.workspace-tabs')
  await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.ranking-row').length)).toBeGreaterThan(0)
  const first = '.ranking-list > li:first-child'
  const second = '.ranking-list > li:nth-child(2)'
  const detailReady = (scope: string) => panel.evaluate(scope => document.querySelector(`${scope} > .field-detail`)?.getAttribute('aria-busy'), scope)
  await panel.click(`${first} > .ranking-row`)
  await expect.poll(() => detailReady(first)).toBe('false')
  expect(await panel.evaluate(() => document.querySelector('.feature-columns > .field-detail'))).toBeNull()
  expect(await panel.evaluate(() => {
    const button = document.querySelector('.ranking-row')!
    return document.getElementById(button.getAttribute('aria-controls')!) === button.parentElement!.querySelector('.field-detail')
  })).toBe(true)
  await panel.click(`${first} > .ranking-row`)
  await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.inline-field-detail').length)).toBe(0)

  // 连续点击不同条目时只展开最后一个，收起后迟到的详情也不能重新出现。
  await panel.evaluate(() => {
    const buttons = document.querySelectorAll<HTMLButtonElement>('.ranking-row')
    buttons[0]!.click()
    buttons[1]!.click()
  })
  await expect.poll(() => detailReady(second)).toBe('false')
  expect(await panel.evaluate(() => {
    const row = document.querySelector('.ranking-list > li:nth-child(2)')!
    return row.querySelector('.field-detail > .mono')?.textContent?.trim() === row.querySelector('.ranking-row .mono')?.textContent?.trim()
  })).toBe(true)
  await panel.evaluate(() => {
    const buttons = document.querySelectorAll<HTMLButtonElement>('.ranking-row')
    buttons[0]!.click()
    buttons[0]!.click()
  })
  await expect.poll(() => panel.evaluate(() => document.querySelector('[aria-label="扩展工作区"] > [role="status"]')?.textContent)).toContain('索引')
  expect(await panel.evaluate(() => document.querySelectorAll('.inline-field-detail').length)).toBe(0)
  await panel.click(`${first} > .ranking-row`)
  await expect.poll(() => detailReady(first)).toBe('false')
  await panel.click(`${first} > .watch-button`)
  await expect.poll(() => panel.evaluate(() => document.querySelector('.ranking-list > li > .watch-button')?.getAttribute('aria-pressed'))).toBe('true')
  expect(await panel.evaluate(() => document.querySelector('.ranking-row')?.getAttribute('aria-expanded'))).toBe('true')
  await clickText(panel, '导出分析报告')
  await expect.poll(async () => (await readdir(downloads)).filter(name => name.endsWith('.json')).length).toBe(1)
  const report = JSON.parse(await readFile(path.join(downloads, (await readdir(downloads))[0]!), 'utf8'))
  expect(report.format).toBe('page-inspector-analysis/v1')
  expect(report.fields.every((field: Record<string, unknown>) => !('preview' in field))).toBe(true)
  expect(report.sources[0].rawUtf8Bytes).toBeLessThan(report.sources[0].messageBytes)
  await panel.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 780, deviceScaleFactor: 1, mobile: false })
  expect(await panel.evaluate(() => {
    const row = document.querySelector('.ranking-list > li')!
    const button = row.querySelector('.ranking-row')!.getBoundingClientRect()
    const detail = row.querySelector('.field-detail')!.getBoundingClientRect()
    const next = row.nextElementSibling!.getBoundingClientRect()
    return detail.top >= button.bottom && detail.bottom <= next.top && document.documentElement.scrollWidth <= window.innerWidth
  })).toBe(true)
  await panel.evaluate(() => document.querySelector('.ranking-list')!.scrollIntoView({ block: 'start' }))
  await panel.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const image = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
  await writeFile(testInfo.outputPath('feature-analysis-inline.png'), Buffer.from(image.data, 'base64'))
  await clickText(panel, '关闭', `${first} > .field-detail`)
  await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.inline-field-detail').length)).toBe(0)
  await panel.send('Emulation.clearDeviceMetricsOverride')
  await panel.click('.distribution > summary')
  for (const index of [1, 2, 3]) {
    const item = `.distribution > h3:nth-of-type(${index}) + .distribution-item`
    await panel.click(`${item} > .distribution-row`)
    await expect.poll(() => detailReady(item)).toBe('false')
    expect(await panel.evaluate(() => document.querySelectorAll('.inline-field-detail').length)).toBe(1)
    await panel.click(`${item} > .distribution-row`)
    await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.inline-field-detail').length)).toBe(0)
  }
  await clickText(panel, '重建索引')
  await panel.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === '取消任务')?.click())
  await expect.poll(() => panel.text()).toContain('任务已取消')
  await clickText(panel, '重建索引')
  await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.ranking-row').length)).toBeGreaterThan(0)
})

test('关注按钮跨入口同步、重载恢复、存储变更与取消反馈', async ({ extension }, testInfo) => {
  const { panel, website, context } = extension
  await website.goto(`${base}/features?version=1`)
  await expect.poll(() => panel.text()).toContain('feature-lab')
  await panel.search('price')
  const treeButton = '.search-result .watch-button'
  const pressed = (selector: string) => panel.evaluate(selector => document.querySelector(selector)?.getAttribute('aria-pressed'), selector)
  await expect.poll(() => pressed(treeButton)).toBe('false')
  await panel.click(treeButton)
  await expect.poll(() => pressed(treeButton)).toBe('true')
  expect(await panel.evaluate(selector => document.querySelector(`${selector} svg`)?.getAttribute('fill'), treeButton)).toBe('currentColor')

  await panel.click('.search-result [title="字段详情"]')
  await expect.poll(() => panel.evaluate(() => [...document.querySelectorAll('.field-detail .watch-button')].map(button => button.getAttribute('aria-pressed')))).toEqual(['true', 'true'])
  await clickText(panel, '检索', '.workspace-tabs')
  await fillField(panel, '[aria-label="条件 1 内容"]', 'feature-lab.watched.price')
  await clickText(panel, '执行查询')
  await expect.poll(() => pressed('.query-result .watch-button')).toBe('true')
  await clickText(panel, '已关注', '.query-result')
  await expect.poll(() => pressed('.field-detail .watch-button')).toBe('false')
  await clickText(panel, '关注', '.query-result')
  await expect.poll(() => pressed('.query-result .watch-button')).toBe('true')

  // 重载扩展视图，确认状态来自持久化规则，而不是只依赖本次点击。
  await panel.send('Page.reload')
  await expect.poll(() => panel.text()).toContain('feature-lab')
  await panel.search('price')
  await expect.poll(() => pressed(treeButton)).toBe('true')
  const saved = await panel.evaluate(async () => Object.entries(await chrome.storage.local.get(null)).find(([key]) => key.startsWith('inspector-definition/'))!) as [string, WatchRule]
  const worker = context.serviceWorkers()[0]!
  await worker.evaluate(async key => chrome.storage.local.remove(key), saved[0])
  await expect.poll(() => pressed(treeButton)).toBe('false')
  // 来自其他作用域的同路径规则不能点亮当前按钮；真实后台存储事件应立即同步。
  await worker.evaluate(async ([key, rule]) => chrome.storage.local.set({ [key]: { ...rule, scope: { ...rule.scope, pathname: '/other-page' } } }), saved)
  await expect.poll(() => pressed(treeButton)).toBe('false')
  await worker.evaluate(async ([key, rule]) => chrome.storage.local.set({ [key]: rule }), saved)
  await expect.poll(() => pressed(treeButton)).toBe('true')
  await panel.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const screenshot = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
  await writeFile(testInfo.outputPath('watched-button.png'), Buffer.from(screenshot.data, 'base64'))

  await clickText(panel, '关注', '.workspace-tabs')
  await clickText(panel, '取消关注', '.watch-row')
  await clickText(panel, '数据', '.workspace-tabs')
  await expect.poll(() => pressed(treeButton)).toBe('false')
})
