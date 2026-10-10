import type { SidePanel } from './fixtures'
import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { clickText, expect, test } from './fixtures'

async function wheel(panel: SidePanel, selector: string) {
  const point = await panel.evaluate((selector) => {
    const bounds = document.querySelector(selector)!.getBoundingClientRect()
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  }, selector)
  await panel.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY: 300 })
  await panel.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

async function outerLayout(panel: SidePanel) {
  return panel.evaluate(() => {
    const main = document.querySelector('.inspector-main')!
    const explorer = document.querySelector('.data-explorer')!.getBoundingClientRect()
    const footer = document.querySelector('.workspace-footer')!.getBoundingClientRect()
    const shell = document.querySelector('.inspector-shell')!.getBoundingClientRect()
    const gutter = Number.parseFloat(getComputedStyle(document.querySelector('#app')!).paddingRight)
    return {
      documentTop: document.scrollingElement!.scrollTop,
      mainTop: main.scrollTop,
      documentOverflow: document.documentElement.scrollHeight > innerHeight + 1,
      mainOverflow: main.scrollHeight > main.clientHeight + 1,
      panesFit: explorer.bottom <= footer.top + 1,
      footerVisible: Math.abs(footer.bottom - shell.bottom) <= 1,
      fullWidth: Math.abs(shell.right + gutter - innerWidth) < 1 && Math.abs(shell.left - gutter) < 1,
    }
  })
}
const fixedOuter = { documentTop: 0, mainTop: 0, documentOverflow: false, mainOverflow: false, panesFit: true, footerVisible: true, fullWidth: true }

async function moduleScroll(panel: SidePanel, selector: string) {
  await panel.evaluate((selector) => {
    document.querySelector(selector)!.scrollTop = 0
  }, selector)
  await wheel(panel, selector)
  await expect.poll(() => panel.evaluate(selector => document.querySelector(selector)!.scrollTop, selector)).toBeGreaterThan(0)
  // 即使内部已到尽头，程序定位和继续滚轮也不能移动最外层。
  await panel.evaluate((selector) => {
    const element = document.querySelector(selector)!
    element.scrollTop = element.scrollHeight
    document.querySelector('.inspector-main')!.scrollTop = 100
    document.scrollingElement!.scrollTop = 100
  }, selector)
  await wheel(panel, selector)
  expect(await panel.evaluate(() => {
    const main = document.querySelector('.inspector-main')!
    const footer = document.querySelector('.workspace-footer')!.getBoundingClientRect()
    const shell = document.querySelector('.inspector-shell')!.getBoundingClientRect()
    const gutter = Number.parseFloat(getComputedStyle(document.querySelector('#app')!).paddingRight)
    return main.scrollTop === 0 && document.scrollingElement!.scrollTop === 0
      && main.scrollHeight <= main.clientHeight + 1
      && Math.abs(footer.bottom - shell.bottom) <= 1
      && Math.abs(shell.right + gutter - innerWidth) < 1 && Math.abs(shell.left - gutter) < 1
  })).toBe(true)
}

for (const [width, height] of [[900, 780], [560, 780], [320, 480]]) {
  test(`数据树与行内详情共用滚动区域，外层固定 ${width}×${height}`, async ({ extension }, testInfo) => {
    const { panel, website } = extension
    await panel.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await website.goto('http://127.0.0.1:4318/large')
    await expect.poll(() => panel.text()).toContain('已限制为 10,000')
    await expect.poll(() => outerLayout(panel)).toEqual(fixedOuter)
    expect(await panel.evaluate(() => !document.querySelector('.ui-split-handle'))).toBe(true)
    await panel.click('.tree-container > .tree-node > .tree-row .tree-select')
    await expect.poll(() => panel.evaluate(() => !!document.querySelector('.tree-inline-detail'))).toBe(true)
    expect(await panel.evaluate(() => {
      const detail = document.querySelector('.tree-inline-detail')!
      return !!detail.closest('.tree-container') && getComputedStyle(detail).overflowY !== 'auto'
    })).toBe(true)
    await moduleScroll(panel, '.tree-container')
    expect(await outerLayout(panel)).toEqual(fixedOuter)

    // 搜索结果和来源弹窗共用固定外层，字段详情随搜索结果一起滚动。
    await panel.search('项目')
    await expect.poll(() => panel.evaluate(() => !!document.querySelector('.search-result'))).toBe(true)
    await moduleScroll(panel, '.search-results')
    expect(await outerLayout(panel)).toEqual(fixedOuter)
    await panel.click('[aria-label="页面与数据来源"]')
    expect(await outerLayout(panel)).toEqual(fixedOuter)
    await wheel(panel, '.context-dialog-body')
    if (await panel.evaluate(() => {
      const body = document.querySelector('.context-dialog-body')!
      return body.scrollHeight > body.clientHeight
    })) {
      await expect.poll(() => panel.evaluate(() => document.querySelector('.context-dialog-body')!.scrollTop)).toBeGreaterThan(0)
    }
    expect(await outerLayout(panel)).toEqual(fixedOuter)
    await panel.click('[aria-label="关闭页面信息"]')
    await panel.search('')
    await expect.poll(() => panel.evaluate(() => !!document.querySelector('.tree-container'))).toBe(true)
    expect(await panel.evaluate(() => document.querySelector('.tree-container')!.scrollTop)).toBe(0)
    const screenshot = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
    await writeFile(testInfo.outputPath(`internal-scroll-${width}.png`), Buffer.from(screenshot.data, 'base64'))
    await clickText(panel, '原文', '.view-tabs')
    await moduleScroll(panel, '.raw-viewer')
  })
}

for (const [width, height] of [[900, 780], [320, 480]]) {
  test(`SEO 内部滚动，外层固定 ${width}×${height}`, async ({ extension }) => {
    const { panel, website } = extension
    await panel.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await website.goto('http://127.0.0.1:4318/features')
    await expect.poll(() => panel.text()).toContain('feature-lab')
    await website.goto('http://127.0.0.1:4318/seo')
    await clickText(panel, 'SEO', '.workspace-tabs')
    await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.seo-row').length)).toBeGreaterThan(0)
    await moduleScroll(panel, '.seo-card')
  })
}
