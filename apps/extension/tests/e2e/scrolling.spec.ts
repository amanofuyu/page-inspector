import type { SidePanel } from './fixtures'
import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { expect, test } from './fixtures'

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
    return {
      documentTop: document.scrollingElement!.scrollTop,
      mainTop: main.scrollTop,
      documentOverflow: document.documentElement.scrollHeight > innerHeight + 1,
      mainOverflow: main.scrollHeight > main.clientHeight + 1,
      panesFit: explorer.bottom <= footer.top + 1,
      footerVisible: Math.abs(footer.bottom - innerHeight) < 1,
    }
  })
}
const fixedOuter = { documentTop: 0, mainTop: 0, documentOverflow: false, mainOverflow: false, panesFit: true, footerVisible: true }

for (const [width, height] of [[900, 780], [560, 780], [320, 480]]) {
  test(`数据树与详情独立滚动，外层固定 ${width}×${height}`, async ({ extension }, testInfo) => {
    const { panel, website } = extension
    await panel.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await website.goto('http://127.0.0.1:4318/large')
    await expect.poll(() => panel.text()).toContain('已限制为 10,000')
    await expect.poll(() => panel.evaluate(() => document.querySelector('#data-field-detail')?.getAttribute('aria-busy'))).toBe('false')
    await expect.poll(() => outerLayout(panel)).toEqual(fixedOuter)
    for (const selector of ['.tree-container', '.detail-pane-body']) {
      expect(await panel.evaluate((selector) => {
        const element = document.querySelector(selector)!
        return element.clientHeight > 0 && element.scrollHeight > element.clientHeight
      }, selector)).toBe(true)
    }

    await wheel(panel, '.tree-container')
    await expect.poll(() => panel.evaluate(() => document.querySelector('.tree-container')!.scrollTop)).toBeGreaterThan(0)
    expect(await panel.evaluate(() => document.querySelector('.detail-pane-body')!.scrollTop)).toBe(0)
    // 到达底部继续滚动，不能把滚轮事件传给外层。
    await panel.evaluate(() => {
      const tree = document.querySelector('.tree-container')!
      tree.scrollTop = tree.scrollHeight
    })
    await wheel(panel, '.tree-container')
    expect(await outerLayout(panel)).toEqual(fixedOuter)
    const treeTop = await panel.evaluate(() => document.querySelector('.tree-container')!.scrollTop)
    await wheel(panel, '.detail-pane-body')
    await expect.poll(() => panel.evaluate(() => document.querySelector('.detail-pane-body')!.scrollTop)).toBeGreaterThan(0)
    expect(await panel.evaluate(() => document.querySelector('.tree-container')!.scrollTop)).toBe(treeTop)
    await panel.evaluate(() => {
      const detail = document.querySelector('.detail-pane-body')!
      detail.scrollTop = detail.scrollHeight
    })
    await wheel(panel, '.detail-pane-body')
    expect(await outerLayout(panel)).toEqual(fixedOuter)

    // 搜索结果、收起详情和来源弹窗均不影响外层高度。
    await panel.search('项目')
    await expect.poll(() => panel.evaluate(() => !!document.querySelector('.search-result'))).toBe(true)
    await wheel(panel, '.search-results')
    await expect.poll(() => panel.evaluate(() => document.querySelector('.search-results')!.scrollTop)).toBeGreaterThan(0)
    expect(await outerLayout(panel)).toEqual(fixedOuter)
    await panel.click('.detail-toggle')
    expect(await panel.evaluate(() => {
      const pane = document.querySelector('.data-tree-pane')!.getBoundingClientRect()
      const explorer = document.querySelector('.data-explorer')!.getBoundingClientRect()
      return Math.abs(pane.height - explorer.height) < 1 && !document.querySelector('#data-field-detail')
    })).toBe(true)
    await panel.click('.detail-toggle')
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
    await panel.evaluate(() => {
      document.querySelector('.detail-pane-body')!.scrollTop = 0
    })
    const screenshot = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
    await writeFile(testInfo.outputPath(`internal-scroll-${width}.png`), Buffer.from(screenshot.data, 'base64'))
  })
}
