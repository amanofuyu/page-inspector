import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { clickText, expect, fillField, test } from './fixtures'

const copySample = '#data-field-detail [title="复制带类型的数据"]'

test('实际操作按成功、失败、警告和信息切换图标及明暗主题配色', async ({ extension }, testInfo) => {
  const { panel, website } = extension
  const appearances = {
    success: { icon: 'lucide-circle-check', label: '成功：', light: 'rgb(21, 128, 61)', dark: 'rgb(34, 197, 95)' },
    error: { icon: 'lucide-circle-x', label: '失败：', light: 'rgb(190, 18, 56)', dark: 'rgb(244, 63, 103)' },
    warning: { icon: 'lucide-triangle-alert', label: '警告：', light: 'rgb(180, 101, 9)', dark: 'rgb(245, 136, 11)' },
    info: { icon: 'lucide-info', label: '信息：', light: 'rgb(0, 112, 243)', dark: 'rgb(30, 168, 255)' },
  }
  async function verify(kind: keyof typeof appearances) {
    const expected = appearances[kind]
    await expect.poll(() => panel.evaluate(() => document.querySelector('.inspector-toast')?.getAttribute('data-kind'))).toBe(kind)
    for (const theme of ['light', 'dark'] as const) {
      await panel.select('[aria-label="界面主题"]', theme)
      await expect.poll(() => panel.evaluate(() => {
        const icon = document.querySelector('.toast-icon')!
        return {
          classes: icon.getAttribute('class')!.split(' '),
          color: getComputedStyle(icon).color,
          label: document.querySelector('.inspector-toast .sr-only')?.textContent,
        }
      })).toEqual({ classes: expect.arrayContaining([expected.icon]), color: expected[theme], label: expected.label })
      await panel.evaluate(async () => {
        await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))
      })
      const screenshot = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
      await writeFile(testInfo.outputPath(`toast-${kind}-${theme}.png`), Buffer.from(screenshot.data, 'base64'))
    }
    await panel.click('.toast-close')
    await expect.poll(() => panel.evaluate(() => !!document.querySelector('.inspector-toast'))).toBe(false)
  }

  await panel.click('#data-field-detail [aria-label="复制当前属性"]')
  await verify('success')
  await clickText(panel, '关注', '.workspace-tabs')
  await fillField(panel, '[aria-label="关注路径"]', 'data.sample.title')
  await clickText(panel, '添加关注')
  await expect.poll(() => panel.text()).toContain('已关注字段；')
  await panel.click('.toast-close')
  await clickText(panel, '添加关注')
  await verify('info')
  await fillField(panel, '[aria-label="关注路径"]', '[')
  await clickText(panel, '添加关注')
  await verify('error')
  await clickText(panel, '数据', '.workspace-tabs')
  await website.goto('http://127.0.0.1:4318/large')
  await expect.poll(() => panel.text()).toContain('已限制为 10,000')
  await expect.poll(() => panel.evaluate(() => document.querySelector('#data-field-detail')?.getAttribute('aria-busy'))).toBe('false')
  await panel.click('#data-field-detail [aria-label="复制当前值"]')
  await verify('warning')
})

test('操作提示固定在窄侧栏右下角，滚动不移位且悬停暂停自动关闭', async ({ extension }, testInfo) => {
  const { panel } = extension
  await panel.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 780, deviceScaleFactor: 1, mobile: false })
  await panel.click('.data-tree-pane .tree-row:has(> [aria-label="展开 sample"]) .tree-select')
  await expect.poll(() => panel.evaluate(() => document.querySelector('#data-field-detail')?.getAttribute('aria-busy'))).toBe('false')
  await panel.evaluate(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))
  })
  const pageHeight = await panel.evaluate(() => document.documentElement.scrollHeight)
  await panel.click(copySample)
  await expect.poll(() => panel.evaluate(() => document.querySelector('.toast-message')?.textContent?.trim())).toBe('已复制带类型的数据')
  expect(await panel.evaluate(() => document.documentElement.scrollHeight)).toBe(pageHeight)
  await panel.evaluate(() => document.querySelector('.inspector-main')!.scrollTo(0, 0))
  await panel.evaluate(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))
  })
  const placement = await panel.evaluate(() => {
    const region = document.querySelector('.toast-region')!
    const bounds = document.querySelector('.inspector-toast')!.getBoundingClientRect()
    return {
      fixed: getComputedStyle(region).position,
      right: document.body.getBoundingClientRect().right - bounds.right,
      bottom: document.querySelector('.workspace-footer')!.getBoundingClientRect().top - bounds.bottom,
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
  expect(placement.bottom).toBeLessThanOrEqual(40)
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
  await panel.click('.data-tree-pane .tree-row:has(> [aria-label="展开 sample"]) .tree-select')
  await expect.poll(() => panel.evaluate(() => document.querySelector('#data-field-detail')?.getAttribute('aria-busy'))).toBe('false')
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
