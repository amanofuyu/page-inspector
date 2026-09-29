import type { SidePanel } from './fixtures'
import { clickText, expect, fillField, test } from './fixtures'

async function selectField(panel: SidePanel, key: string) {
  await panel.search(key)
  await expect.poll(() => panel.evaluate(key => [...document.querySelectorAll('.search-result .tree-key')].some(node => node.textContent === key), key)).toBe(true)
  await panel.evaluate((key) => {
    const field = [...document.querySelectorAll('.search-result .tree-select')].find(node => node.querySelector('.tree-key')?.textContent === key)!
    field.setAttribute('data-copy-target', '')
  }, key)
  await panel.click('[data-copy-target]')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.detail-field-name')?.textContent?.trim())).toBe(key)
  await expect.poll(() => panel.evaluate(() => document.querySelector('#data-field-detail')?.getAttribute('aria-busy'))).toBe('false')
}

async function dismissToast(panel: SidePanel) {
  if (await panel.evaluate(() => !!document.querySelector('.toast-close')))
    await panel.click('.toast-close')
}

test('当前值和当前属性复制实际文本，保留旧的带类型复制', async ({ extension }) => {
  const { panel, website } = extension
  const clipboard = async () => {
    await website.bringToFront()
    return website.evaluate(() => navigator.clipboard.readText())
  }
  await selectField(panel, 'title')
  await panel.click('#data-field-detail [aria-label="复制当前值"]')
  await expect.poll(clipboard).toBe('Nuxt 3.17.5')
  await dismissToast(panel)
  await panel.click('#data-field-detail [aria-label="复制当前属性"]')
  await expect.poll(clipboard).toBe('title')
  await dismissToast(panel)
  await selectField(panel, 'amount')
  await panel.click('#data-field-detail [aria-label="复制当前值"]')
  await expect.poll(clipboard).toBe('99n')
  await expect.poll(() => panel.text()).toContain('已复制当前值（JavaScript 表达式）')
  await dismissToast(panel)
  await panel.click('#data-field-detail [aria-label="复制带类型的数据"]')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.toast-message')?.textContent?.trim())).toBe('已复制带类型的数据')
  expect(JSON.parse(await clipboard())).toMatchObject({ format: 'page-inspector/v1', node: { type: 'bigint' } })

  await website.goto('http://127.0.0.1:4318/features')
  await expect.poll(() => panel.text()).toContain('feature-lab')
  await selectField(panel, 'watched')
  await panel.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 780, deviceScaleFactor: 1, mobile: false })
  await panel.click('#data-field-detail [aria-label="复制当前值"]')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.toast-message')?.textContent?.trim())).toBe('已复制当前值')
  expect(JSON.parse(await clipboard())).toEqual({ price: 120 })
  expect(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('.inspector-main')!.scrollTop === 0)).toBe(true)
})

test('截断值复制提示原因且不覆盖剪贴板，属性名仍可复制', async ({ extension }) => {
  const { panel, website } = extension
  await website.goto('http://127.0.0.1:4318/large')
  await expect.poll(() => panel.text()).toContain('已限制为 10,000')
  await expect.poll(() => panel.evaluate(() => document.querySelector('#data-field-detail')?.getAttribute('aria-busy'))).toBe('false')
  await panel.click('#data-field-detail [aria-label="复制当前属性"]')
  await dismissToast(panel)
  await panel.click('#data-field-detail [aria-label="复制当前值"]')
  await expect.poll(() => panel.text()).toContain('当前值超出展示上限')
  await website.bringToFront()
  expect(await website.evaluate(() => navigator.clipboard.readText())).toBe('data')
})

test('检索就地详情同样提供当前值和属性名复制', async ({ extension }) => {
  const { panel, website } = extension
  await clickText(panel, '检索', '.workspace-tabs')
  await fillField(panel, '[aria-label="条件 1 内容"]', 'sample.amount')
  await clickText(panel, '执行查询')
  await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.query-result').length)).toBe(1)
  await panel.click('.query-result .path-button')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.inline-field-detail')?.getAttribute('aria-busy'))).toBe('false')
  await panel.click('.inline-field-detail [aria-label="复制当前值"]')
  await website.bringToFront()
  await expect.poll(() => website.evaluate(() => navigator.clipboard.readText())).toBe('99n')
  await dismissToast(panel)
  await panel.click('.inline-field-detail [aria-label="复制当前属性"]')
  await website.bringToFront()
  await expect.poll(() => website.evaluate(() => navigator.clipboard.readText())).toBe('amount')
})
