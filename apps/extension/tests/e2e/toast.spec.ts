import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { expect, test } from './fixtures'

const copySample = '.tree-row:has(> [aria-label="折叠 sample"]) > .tree-actions button:last-child'

test('操作提示固定在窄侧栏右下角，滚动不移位且悬停暂停自动关闭', async ({ extension }, testInfo) => {
  const { panel } = extension
  await panel.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 780, deviceScaleFactor: 1, mobile: false })
  await panel.click('[aria-label="展开 sample"]')
  await panel.evaluate(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))
  })
  const pageHeight = await panel.evaluate(() => document.documentElement.scrollHeight)
  await panel.click(copySample)
  await expect.poll(() => panel.evaluate(() => document.querySelector('.toast-message')?.textContent?.trim())).toBe('已复制带类型的数据')
  expect(await panel.evaluate(() => document.documentElement.scrollHeight)).toBe(pageHeight)
  await panel.evaluate(() => scrollTo(0, 0))
  await panel.evaluate(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))
  })
  const placement = await panel.evaluate(() => {
    const region = document.querySelector('.toast-region')!
    const bounds = document.querySelector('.inspector-toast')!.getBoundingClientRect()
    return {
      fixed: getComputedStyle(region).position,
      right: document.body.getBoundingClientRect().right - bounds.right,
      bottom: innerHeight - bounds.bottom,
      left: bounds.left,
      top: bounds.top,
      live: region.getAttribute('aria-live'),
      focused: !!document.activeElement?.closest('.inspector-toast'),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }
  })
  expect(placement).toMatchObject({ fixed: 'fixed', live: 'polite', focused: false, overflow: false })
  expect(placement.right).toBeGreaterThanOrEqual(10)
  expect(placement.right).toBeLessThanOrEqual(16)
  expect(placement.bottom).toBeGreaterThanOrEqual(10)
  expect(placement.bottom).toBeLessThanOrEqual(16)
  expect(placement.left).toBeGreaterThanOrEqual(10)
  expect(placement.top).toBeGreaterThan(0)
  const hover = await panel.evaluate(() => {
    const bounds = document.querySelector('.toast-message')!.getBoundingClientRect()
    return { x: bounds.left + 5, y: bounds.top + 5 }
  })
  await panel.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...hover })
  await panel.evaluate(() => new Promise(resolve => setTimeout(resolve, 5200)))
  expect(await panel.evaluate(() => !!document.querySelector('.inspector-toast:not([inert])'))).toBe(true)
  for (const theme of ['light', 'dark']) {
    await panel.select('[aria-label="界面主题"]', theme)
    await panel.evaluate(async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))
    })
    const screenshot = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
    await writeFile(testInfo.outputPath(`toast-${theme}.png`), Buffer.from(screenshot.data, 'base64'))
  }
  await panel.click('.toast-close')
  await expect.poll(() => panel.evaluate(() => !!document.querySelector('.inspector-toast'))).toBe(false)
})

test('同文案提示更新、键盘停留与关闭、焦点恢复及自动消失', async ({ extension }) => {
  const { panel } = extension
  await panel.click('[aria-label="展开 sample"]')
  await panel.click(copySample)
  await expect.poll(() => panel.evaluate(() => !!document.querySelector('.toast-message'))).toBe(true)
  const trigger = await panel.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  await panel.evaluate(() => document.querySelector('.toast-message')!.setAttribute('data-old-message', ''))
  await panel.click(copySample)
  await expect.poll(() => panel.evaluate(() => !!document.querySelector('.toast-message[data-old-message]'))).toBe(false)
  expect(await panel.evaluate(() => document.querySelectorAll('.inspector-toast').length)).toBe(1)
  await panel.evaluate(() => document.querySelector<HTMLButtonElement>('.toast-close')!.focus())
  await panel.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 })
  await panel.evaluate(() => new Promise(resolve => setTimeout(resolve, 5200)))
  expect(await panel.evaluate(() => !!document.querySelector('.inspector-toast:not([inert])'))).toBe(true)
  await panel.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await panel.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await expect.poll(() => panel.evaluate(() => !!document.querySelector('.inspector-toast'))).toBe(false)
  expect(await panel.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(trigger)
  await panel.click(copySample)
  await expect.poll(() => panel.evaluate(() => !!document.querySelector('.toast-message'))).toBe(true)
  await expect.poll(() => panel.evaluate(() => !!document.querySelector('.inspector-toast')), { timeout: 7000 }).toBe(false)
})
