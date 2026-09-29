import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { expect, test } from './fixtures'

for (const [width, height, theme] of [[900, 780, 'light'], [320, 480, 'dark']] as const) {
  test(`页面来源弹窗的布局、内部滚动与关闭交互 ${width}×${height}`, async ({ extension }, testInfo) => {
    const { panel, website } = extension
    await panel.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await website.goto(`http://127.0.0.1:4318/external?source=${'long-address-'.repeat(12)}`)
    await expect.poll(() => panel.text()).toContain('外部 payload')
    await panel.select('[aria-label="界面主题"]', theme)
    await expect.poll(() => panel.evaluate(() => document.querySelector('#data-field-detail')?.getAttribute('aria-busy'))).toBe('false')
    await panel.evaluate(async () => {
      await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))
    })
    const before = await panel.evaluate(() => {
      const tree = document.querySelector('.data-tree-pane')!.getBoundingClientRect()
      return { top: tree.top, height: tree.height, scroll: document.querySelector('.tree-container')!.scrollTop }
    })
    await panel.click('[aria-label="页面与数据来源"]')
    await expect.poll(() => panel.evaluate(() => document.querySelector('#page-context')!.matches(':modal'))).toBe(true)
    expect(await panel.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('关闭页面信息')
    expect(await panel.evaluate(() => document.querySelectorAll('.context-source-item').length)).toBe(2)
    expect(await panel.evaluate(() => {
      const tree = document.querySelector('.data-tree-pane')!.getBoundingClientRect()
      return { top: tree.top, height: tree.height, scroll: document.querySelector('.tree-container')!.scrollTop }
    })).toEqual(before)
    await panel.evaluate(async () => {
      await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))
    })
    const screenshot = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
    await writeFile(testInfo.outputPath(`page-context-${theme}-${width}.png`), Buffer.from(screenshot.data, 'base64'))
    expect(await panel.evaluate(() => {
      const dialog = document.querySelector('#page-context')!
      const bounds = dialog.getBoundingClientRect()
      const body = document.querySelector('.context-dialog-body')!
      return {
        left: bounds.left >= 10,
        top: bounds.top >= 10,
        right: bounds.right <= innerWidth - 10,
        bottom: bounds.bottom <= innerHeight - 10,
        bodyFits: body.scrollWidth <= body.clientWidth,
        documentFitsHeight: document.documentElement.scrollHeight <= innerHeight,
        documentFitsWidth: document.documentElement.scrollWidth <= innerWidth,
      }
    })).toEqual({ left: true, top: true, right: true, bottom: true, bodyFits: true, documentFitsHeight: true, documentFitsWidth: true })

    // 模态框打开后背景无法接收焦点，关闭前的背景滚动位置保持不变。
    await panel.evaluate(() => document.querySelector<HTMLButtonElement>('.refresh-button')!.focus())
    expect(await panel.evaluate(() => document.querySelector('#page-context')!.contains(document.activeElement))).toBe(true)
    if (width === 320) {
      const point = await panel.evaluate(() => {
        const bounds = document.querySelector('.context-dialog-body')!.getBoundingClientRect()
        return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      })
      await panel.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY: 500 })
      await expect.poll(() => panel.evaluate(() => document.querySelector('.context-dialog-body')!.scrollTop)).toBeGreaterThan(0)
      expect(await panel.evaluate(() => document.querySelector('.tree-container')!.scrollTop)).toBe(before.scroll)
      expect(await panel.evaluate(() => {
        const dialog = document.querySelector('#page-context')!.getBoundingClientRect()
        const footer = document.querySelector('.context-dialog-footer')!.getBoundingClientRect()
        return footer.bottom <= dialog.bottom && footer.top >= dialog.top
      })).toBe(true)
    }
    await panel.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await panel.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await expect.poll(() => panel.evaluate(() => document.querySelector<HTMLDialogElement>('#page-context')!.open)).toBe(false)
    expect(await panel.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('页面与数据来源')
    await panel.click('.footer-source')
    await expect.poll(() => panel.evaluate(() => document.querySelector('#page-context')!.matches(':modal'))).toBe(true)
    await panel.click('.context-dialog-footer button')
    await expect.poll(() => panel.evaluate(() => document.querySelector<HTMLDialogElement>('#page-context')!.open)).toBe(false)
    expect(await panel.evaluate(() => document.activeElement?.classList.contains('footer-source'))).toBe(true)
    await panel.click('.footer-source')
    await panel.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 2, y: 2, button: 'left', clickCount: 1 })
    await panel.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 2, y: 2, button: 'left', clickCount: 1 })
    await expect.poll(() => panel.evaluate(() => document.querySelector<HTMLDialogElement>('#page-context')!.open)).toBe(false)
    await panel.click('[aria-label="页面与数据来源"]')
    await panel.click('[aria-label="关闭页面信息"]')
    await expect.poll(() => panel.evaluate(() => document.querySelector<HTMLDialogElement>('#page-context')!.open)).toBe(false)
  })
}
