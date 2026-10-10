import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { clickText, copyField, expect, test } from './fixtures'

for (const [width, height] of [[900, 780], [560, 780], [320, 480]] as const) {
  test(`数据模块只保留树展开和复制菜单，适配视口 ${width}×${height}`, async ({ extension }, testInfo) => {
    const { panel } = extension
    await panel.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    expect(await panel.evaluate(() => {
      const tree = document.querySelector('.data-tree-pane')!.getBoundingClientRect()
      const footer = document.querySelector('.workspace-footer')!.getBoundingClientRect()
      return !document.querySelector('.ui-split-handle, [aria-label^="字段详情"]')
        && tree.bottom <= footer.top + 1 && Math.abs(footer.bottom - document.querySelector('.inspector-shell')!.getBoundingClientRect().bottom) <= 1
        && document.documentElement.scrollWidth <= innerWidth
    })).toBe(true)

    // 菜单操作不展开分支，浮层传送到 body 后仍保持在视口内。
    await panel.click('.tree-row:has(> [aria-label="展开 sample"]) > .tree-actions .ui-menu-trigger')
    await expect.poll(() => panel.evaluate(() => {
      const menu = document.querySelector('[role="menu"]')?.getBoundingClientRect()
      return !!menu && menu.width > 0 && menu.left >= 0 && menu.right <= innerWidth + 1
        && menu.top >= 0 && menu.bottom <= innerHeight + 1
    })).toBe(true)
    expect(await panel.evaluate(() => document.querySelectorAll('[role="menuitem"]').length)).toBe(4)
    expect(await panel.evaluate(() => document.querySelector('[aria-label="展开 sample"]')?.getAttribute('aria-expanded'))).toBe('false')
    const menuScreenshot = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
    await writeFile(testInfo.outputPath(`copy-menu-${width}.png`), Buffer.from(menuScreenshot.data, 'base64'))
    await panel.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await panel.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await expect.poll(() => panel.evaluate(() => document.activeElement?.classList.contains('ui-menu-trigger'))).toBe(true)
    await copyField(panel, 'key')
    await panel.click('.toast-close')

    // 调整宽度保留分支状态，点击正文只展开子节点。
    await panel.click('.data-tree-pane [aria-label="展开 sample"]')
    await panel.send('Emulation.setDeviceMetricsOverride', { width: width >= 600 ? 320 : 900, height: 780, deviceScaleFactor: 1, mobile: false })
    expect(await panel.evaluate(() => document.querySelector('.data-tree-pane [aria-label="折叠 sample"]')?.getAttribute('aria-expanded'))).toBe('true')
    await panel.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    const screenshot = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
    await writeFile(testInfo.outputPath(`merged-data-${width}.png`), Buffer.from(screenshot.data, 'base64'))
    await clickText(panel, 'SEO', '.workspace-tabs')
    await clickText(panel, '数据', '.workspace-tabs')
    await expect.poll(() => panel.evaluate(() => document.querySelector('.data-tree-pane [aria-label="折叠 sample"]')?.getAttribute('aria-expanded'))).toBe('true')
    expect(await panel.evaluate(() => document.querySelector('[aria-label^="字段详情"]'))).toBeNull()
  })
}
