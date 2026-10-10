import type { SidePanel } from './fixtures'
import { copyField, expect, test } from './fixtures'

async function selectField(panel: SidePanel, key: string) {
  await panel.search(key)
  await expect.poll(() => panel.evaluate(key => [...document.querySelectorAll('.search-result .tree-key')].some(node => node.textContent === key), key)).toBe(true)
  await panel.evaluate((key) => {
    const field = [...document.querySelectorAll('.search-result .tree-select')].find(node => node.querySelector('.tree-key')?.textContent === key)!
    field.setAttribute('data-copy-target', '')
  }, key)
  await panel.click('[data-copy-target]')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.detail-field-key')?.textContent?.trim())).toBe(key)
  await expect.poll(() => panel.evaluate(() => document.querySelector('.tree-inline-detail .data-field-detail')?.getAttribute('aria-busy'))).toBe('false')
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
  await copyField(panel, 'value')
  await expect.poll(clipboard).toBe('Nuxt 3.17.5')
  await dismissToast(panel)
  await copyField(panel, 'key')
  await expect.poll(clipboard).toBe('title')
  await dismissToast(panel)
  await selectField(panel, 'amount')
  await copyField(panel, 'value')
  await expect.poll(clipboard).toBe('99n')
  await expect.poll(() => panel.text()).toContain('已复制当前值（JavaScript 表达式）')
  await dismissToast(panel)
  await copyField(panel, 'typed')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.toast-message')?.textContent?.trim())).toBe('已复制带类型的数据')
  expect(JSON.parse(await clipboard())).toMatchObject({ format: 'page-inspector/v1', node: { type: 'bigint' } })

  await website.goto('http://127.0.0.1:4318/features')
  await expect.poll(() => panel.text()).toContain('feature-lab')
  await selectField(panel, 'watched')
  await panel.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 780, deviceScaleFactor: 1, mobile: false })
  await copyField(panel, 'value')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.toast-message')?.textContent?.trim())).toBe('已复制当前值')
  expect(JSON.parse(await clipboard())).toEqual({ price: 120 })
  expect(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('.inspector-main')!.scrollTop === 0)).toBe(true)
})

test('截断值复制提示原因且不覆盖剪贴板，属性名仍可复制', async ({ extension }) => {
  const { panel, website } = extension
  await website.goto('http://127.0.0.1:4318/large')
  await expect.poll(() => panel.text()).toContain('已限制为 10,000')
  await copyField(panel, 'key')
  await dismissToast(panel)
  await copyField(panel, 'value')
  await expect.poll(() => panel.text()).toContain('当前值超出展示上限')
  await website.bringToFront()
  expect(await website.evaluate(() => navigator.clipboard.readText())).toBe('data')
})
