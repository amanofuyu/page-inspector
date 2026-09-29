import type { WatchRule } from '../../features/watch/model'
import type { SidePanel } from './fixtures'
import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { clickText, expect, fillField, test } from './fixtures'

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
      fullWidth: Math.abs(document.querySelector('.inspector-shell')!.getBoundingClientRect().right - innerWidth) < 1,
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
    return main.scrollTop === 0 && document.scrollingElement!.scrollTop === 0
      && main.scrollHeight <= main.clientHeight + 1
      && Math.abs(footer.bottom - innerHeight) < 1
      && Math.abs(document.querySelector('.inspector-shell')!.getBoundingClientRect().right - innerWidth) < 1
  })).toBe(true)
}

for (const [width, height] of [[900, 780], [560, 780], [320, 480]]) {
  test(`数据树与详情独立滚动，外层固定 ${width}×${height}`, async ({ extension }, testInfo) => {
    const { panel, website } = extension
    await panel.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await website.goto('http://127.0.0.1:4318/large')
    await expect.poll(() => panel.text()).toContain('已限制为 10,000')
    await expect.poll(() => panel.evaluate(() => document.querySelector('#data-field-detail')?.getAttribute('aria-busy'))).toBe('false')
    await expect.poll(() => outerLayout(panel)).toEqual(fixedOuter)
    expect(await panel.evaluate(() => {
      const tree = document.querySelector('.data-tree-pane')!
      const detail = document.querySelector('#data-field-detail')!
      const treeBounds = tree.getBoundingClientRect()
      const detailBounds = detail.getBoundingClientRect()
      const treeHeading = tree.querySelector('.detail-pane-heading')!.getBoundingClientRect()
      const detailHeading = detail.querySelector('.detail-pane-heading')!.getBoundingClientRect()
      const sideBySide = innerWidth >= 600
      return Math.abs(treeBounds.height - detailBounds.height) < 1
        && Math.abs(treeHeading.height - detailHeading.height) < 1
        && Math.abs(detailBounds.right - innerWidth) < 1
        && getComputedStyle(detail).scrollbarGutter === 'auto'
        && (!sideBySide || (Math.abs(treeBounds.top - detailBounds.top) < 1 && Math.abs(treeHeading.bottom - detailHeading.bottom) < 1))
    })).toBe(true)
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
    await clickText(panel, '原文', '.view-tabs')
    await moduleScroll(panel, '.raw-viewer')
  })
}

for (const [width, height] of [[900, 780], [320, 480]]) {
  test(`分析、检索、关注和 SEO 各自滚动，外层固定 ${width}×${height}`, async ({ extension }) => {
    const { panel, website } = extension
    await panel.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await website.goto('http://127.0.0.1:4318/features')
    await expect.poll(() => panel.text()).toContain('feature-lab')
    const workbench = '[aria-label="扩展工作区"]'
    await clickText(panel, '分析', '.workspace-tabs')
    await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.ranking-row').length)).toBeGreaterThan(0)
    await moduleScroll(panel, workbench)
    await clickText(panel, '检索', '.workspace-tabs')
    await fillField(panel, '[aria-label="条件 1 内容"]', 'feature-lab.many.*')
    await clickText(panel, '执行查询')
    await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.query-result').length)).toBe(50)
    await moduleScroll(panel, workbench)
    await clickText(panel, '关注', '.workspace-tabs')
    await fillField(panel, '[aria-label="关注路径"]', 'data.feature-lab.watched.price')
    await clickText(panel, '添加关注')
    await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.watch-row').length)).toBe(1)
    await panel.evaluate(async () => {
      const rule = Object.entries(await chrome.storage.local.get(null)).find(([key]) => key.startsWith('inspector-definition/v1/'))![1] as WatchRule
      await chrome.storage.local.set(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`inspector-definition/v1/layout-${i}`, { ...rule, id: `layout-${i}`, name: `字段 ${i}` }])))
    })
    await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.watch-row').length)).toBe(9)
    await moduleScroll(panel, workbench)
    await website.goto('http://127.0.0.1:4318/seo')
    await clickText(panel, 'SEO', '.workspace-tabs')
    await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.seo-row').length)).toBeGreaterThan(0)
    await moduleScroll(panel, '.seo-card')
  })
}
