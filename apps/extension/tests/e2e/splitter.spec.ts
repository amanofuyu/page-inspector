import type { SidePanel } from './fixtures'
import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { clickText, expect, test } from './fixtures'

async function ratio(panel: SidePanel) {
  return panel.evaluate(() => Number(document.querySelector('.ui-split-handle')?.getAttribute('aria-valuenow')))
}

async function drag(panel: SidePanel, delta: number) {
  const point = await panel.evaluate(() => {
    const trigger = document.querySelector('.ui-split-handle')!
    const rect = trigger.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, horizontal: trigger.getAttribute('data-orientation') === 'horizontal' }
  })
  await panel.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
  await panel.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 })
  const end = { x: point.x + (point.horizontal ? delta : 0), y: point.y + (point.horizontal ? 0 : delta) }
  for (let step = 1; step <= 5; step++) {
    await panel.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x + (end.x - point.x) * step / 5, y: point.y + (end.y - point.y) * step / 5, button: 'left', buttons: 1 })
  }
  await panel.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...end, button: 'left', buttons: 0, clickCount: 1 })
}

async function press(panel: SidePanel, key: string, keyCode: number) {
  await panel.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: keyCode })
  await panel.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: keyCode })
}

async function fixedLayout(panel: SidePanel) {
  return panel.evaluate(() => {
    const tree = document.querySelector('.data-tree-pane')!.getBoundingClientRect()
    const detail = document.querySelector('#data-field-detail')!.getBoundingClientRect()
    const horizontal = document.querySelector('.ui-split-handle')!.getAttribute('data-orientation') === 'horizontal'
    const main = document.querySelector('.inspector-main')!
    const footer = document.querySelector('.workspace-footer')!.getBoundingClientRect()
    return document.scrollingElement!.scrollTop === 0 && main.scrollTop === 0
      && document.documentElement.scrollHeight <= innerHeight + 1 && main.scrollHeight <= main.clientHeight + 1
      && Math.abs(detail.right - innerWidth) < 1 && Math.abs(footer.bottom - innerHeight) < 1
      && tree.bottom <= footer.top + 1 && detail.bottom <= footer.top + 1
      && (!horizontal || (Math.abs(tree.top - detail.top) < 1 && Math.abs(tree.height - detail.height) < 1))
      && ['.tree-container', '.detail-pane-body'].every(selector => document.querySelector(selector)!.clientHeight > 0)
  })
}

for (const [width, height, delta] of [[900, 780, -100], [560, 780, 80], [320, 480, 20]] as const) {
  test(`拖动、键盘与分栏偏好保留 ${width}×${height}`, async ({ extension }, testInfo) => {
    const { panel, website } = extension
    const horizontal = width >= 600
    await panel.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await website.goto('http://127.0.0.1:4318/large')
    await expect.poll(() => panel.text()).toContain('已限制为 10,000')
    await expect.poll(() => ratio(panel)).toBe(horizontal ? 64 : 50)
    expect(await panel.evaluate(() => {
      const trigger = document.querySelector('.ui-split-handle')!
      return trigger.getAttribute('role') === 'separator' && !!trigger.getAttribute('aria-label')
        && trigger.getAttribute('aria-controls')!.split(' ').every(id => !!document.getElementById(id))
        && trigger.getAttribute('aria-orientation') === (trigger.getAttribute('data-orientation') === 'horizontal' ? 'vertical' : 'horizontal')
    })).toBe(true)
    const before = await ratio(panel)
    const beforePixels = await panel.evaluate((horizontal) => {
      const rect = document.querySelector('.data-tree-pane')!.getBoundingClientRect()
      return horizontal ? rect.width : rect.height
    }, horizontal)
    await drag(panel, delta)
    await expect.poll(async () => Math.abs(await ratio(panel) - before)).toBeGreaterThan(3)
    const afterPixels = await panel.evaluate((horizontal) => {
      const rect = document.querySelector('.data-tree-pane')!.getBoundingClientRect()
      return horizontal ? rect.width : rect.height
    }, horizontal)
    expect((afterPixels - beforePixels) * Math.sign(delta)).toBeGreaterThan(10)
    expect(await fixedLayout(panel)).toBe(true)

    // 键盘与鼠标共用相同约束；极限位置仍保留标题和可滚动正文。
    await panel.evaluate(() => document.querySelector<HTMLElement>('.ui-split-handle')!.focus())
    await press(panel, 'Home', 36)
    await expect.poll(() => panel.evaluate(() => {
      const trigger = document.querySelector('.ui-split-handle')!
      return Math.abs(Number(trigger.getAttribute('aria-valuenow')) - Number(trigger.getAttribute('aria-valuemin'))) < 0.1
    })).toBe(true)
    expect(await fixedLayout(panel)).toBe(true)
    await press(panel, 'End', 35)
    await expect.poll(() => panel.evaluate(() => {
      const trigger = document.querySelector('.ui-split-handle')!
      return Math.abs(Number(trigger.getAttribute('aria-valuenow')) - Number(trigger.getAttribute('aria-valuemax'))) < 0.1
    })).toBe(true)
    expect(await fixedLayout(panel)).toBe(true)
    const maximum = await ratio(panel)
    await press(panel, horizontal ? 'ArrowLeft' : 'ArrowUp', horizontal ? 37 : 38)
    await expect.poll(() => ratio(panel)).toBeLessThan(maximum)
    const saved = await ratio(panel)
    for (const selector of ['.tree-container', '.detail-pane-body']) {
      await panel.evaluate((selector) => {
        const element = document.querySelector(selector)!
        element.scrollTop = element.scrollHeight
      }, selector)
      expect(await panel.evaluate(selector => document.querySelector(selector)!.scrollTop, selector)).toBeGreaterThan(0)
    }
    expect(await fixedLayout(panel)).toBe(true)

    await panel.click('.detail-toggle')
    expect(await panel.evaluate(() => {
      const tree = document.querySelector('.data-tree-pane')!.getBoundingClientRect()
      const explorer = document.querySelector('.data-explorer')!.getBoundingClientRect()
      return !document.querySelector('.ui-split-handle') && Math.abs(tree.width - explorer.width) < 1 && Math.abs(tree.height - explorer.height) < 1
    })).toBe(true)
    await panel.click('.detail-toggle')
    await expect.poll(() => ratio(panel)).toBeCloseTo(saved, 1)
    await clickText(panel, '全部', '.view-tabs')
    await expect.poll(() => ratio(panel)).toBeCloseTo(saved, 1)
    await clickText(panel, '原文', '.view-tabs')
    await clickText(panel, '数据', '.view-tabs')
    await expect.poll(() => ratio(panel)).toBeCloseTo(saved, 1)
    await clickText(panel, '分析', '.workspace-tabs')
    await clickText(panel, '数据', '.workspace-tabs')
    await expect.poll(() => ratio(panel)).toBeCloseTo(saved, 1)

    // 空间不足时暂时收紧比例；恢复窗口后回到用户设置，不记录临时约束。
    await panel.send('Emulation.setDeviceMetricsOverride', { width: horizontal ? 600 : width, height: horizontal ? height : Math.max(420, height - 240), deviceScaleFactor: 1, mobile: false })
    await expect.poll(() => ratio(panel)).toBeLessThan(saved)
    await panel.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await expect.poll(() => ratio(panel)).toBeCloseTo(saved, 1)
    await panel.evaluate(() => document.querySelector('.data-tree-pane .tree-expand[aria-expanded="false"]')!.setAttribute('data-resize-test', 'expanded'))
    await panel.click('[data-resize-test="expanded"]')

    // 横向与纵向各有一份偏好，响应式切换后回到之前的比例。
    await panel.send('Emulation.setDeviceMetricsOverride', { width: horizontal ? 560 : 900, height: 780, deviceScaleFactor: 1, mobile: false })
    await expect.poll(() => ratio(panel)).toBe(horizontal ? 50 : 64)
    expect(await panel.evaluate(() => document.querySelector('[data-resize-test="expanded"]')?.getAttribute('aria-expanded'))).toBe('true')
    await drag(panel, -40)
    const other = await ratio(panel)
    expect(Math.abs(other - (horizontal ? 50 : 64))).toBeGreaterThan(3)
    await panel.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await expect.poll(() => ratio(panel)).toBeCloseTo(saved, 1)
    expect(await fixedLayout(panel)).toBe(true)
    await panel.send('Emulation.setDeviceMetricsOverride', { width: horizontal ? 560 : 900, height: 780, deviceScaleFactor: 1, mobile: false })
    await expect.poll(() => ratio(panel)).toBeCloseTo(other, 1)
    await panel.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await expect.poll(() => ratio(panel)).toBeCloseTo(saved, 1)
    const screenshot = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
    await writeFile(testInfo.outputPath(`resized-${width}.png`), Buffer.from(screenshot.data, 'base64'))
  })
}
