import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { clickText, expect, test } from './fixtures'

test('鼠标反馈保持热区稳定，展开与状态尺寸连续变化且支持快速反向操作', async ({ extension }, testInfo) => {
  const { panel } = extension
  const button = '.workspace-tabs button:nth-child(2)'
  const before = await panel.evaluate((selector) => {
    const target = document.querySelector(selector)!
    const bounds = target.getBoundingClientRect()
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, color: getComputedStyle(target).backgroundColor }
  }, button)
  await panel.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: before.x + before.width / 2, y: before.y + before.height / 2 })
  await expect.poll(() => panel.evaluate(selector => getComputedStyle(document.querySelector(selector)!).backgroundColor, button)).not.toBe(before.color)
  expect(await panel.evaluate((selector) => {
    const { x, y, width, height } = document.querySelector(selector)!.getBoundingClientRect()
    return { x, y, width, height }
  }, button)).toEqual({ x: before.x, y: before.y, width: before.width, height: before.height })

  // 连续采样真实布局，要求中间帧存在而非只改变透明度或延后跳到终点。
  const opening = await panel.evaluate(async () => {
    const toggle = document.querySelector<HTMLButtonElement>('[aria-label="展开 sample"]')!
    const node = toggle.closest('.tree-node')!
    toggle.click()
    const heights: number[] = []
    for (let frame = 0; frame < 24; frame++) {
      await new Promise(requestAnimationFrame)
      heights.push(node.querySelector(':scope > .tree-children')?.getBoundingClientRect().height ?? 0)
    }
    return heights
  })
  expect(opening.at(-1)).toBeGreaterThan(100)
  expect(new Set(opening.filter(height => height > 0 && height < opening.at(-1)! - 1).map(Math.round)).size).toBeGreaterThan(2)

  const interrupted = await panel.evaluate(async () => {
    const toggle = document.querySelector<HTMLButtonElement>('[aria-label="折叠 sample"]')!
    const node = toggle.closest('.tree-node')!
    toggle.click()
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
    const leavingInert = node.querySelector<HTMLElement>(':scope > .tree-children')?.inert
    toggle.click()
    for (let frame = 0; frame < 24; frame++)
      await new Promise(requestAnimationFrame)
    return { leavingInert, expanded: toggle.getAttribute('aria-expanded'), children: node.querySelectorAll(':scope > .tree-children').length, inert: node.querySelector<HTMLElement>(':scope > .tree-children')?.inert }
  })
  expect(interrupted).toEqual({ leavingInert: true, expanded: 'true', children: 1, inert: false })

  await panel.click('[aria-label="页面与数据来源"]')
  await panel.click('.source-details > .ui-disclosure-trigger')
  await panel.evaluate(async () => {
    await Promise.all(document.querySelector('.source-details')!.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})))
  })
  const disclosure = await panel.evaluate(async () => {
    const source = document.querySelector<HTMLElement>('.source-details')!
    source.querySelector<HTMLElement>('.ui-disclosure-trigger')!.click()
    const heights: number[] = []
    for (let frame = 0; frame < 24; frame++) {
      await new Promise(requestAnimationFrame)
      heights.push(source.getBoundingClientRect().height)
    }
    return { heights, open: source.querySelector('.ui-disclosure-trigger')!.getAttribute('aria-expanded') === 'true' }
  })
  expect(disclosure.open).toBe(true)
  expect(new Set(disclosure.heights.map(Math.round)).size).toBeGreaterThan(2)

  await panel.click('[aria-label="关闭页面信息"]')
  const resizing = await panel.evaluate(async () => {
    const target = document.querySelector<HTMLElement>('.feature-primary')!
    const before = target.getBoundingClientRect().height
    Array.from(document.querySelectorAll<HTMLButtonElement>('.workspace-tabs button')).find(button => button.textContent?.trim() === '检索')!.click()
    const heights: number[] = []
    for (let frame = 0; frame < 24; frame++) {
      await new Promise(requestAnimationFrame)
      heights.push(target.getBoundingClientRect().height)
    }
    return { before, heights, inlineHeight: target.style.height, animations: target.getAnimations().length }
  })
  expect(Math.abs(resizing.before - resizing.heights.at(-1)!)).toBeGreaterThan(10)
  expect(new Set(resizing.heights.map(Math.round)).size).toBeGreaterThan(2)
  expect(resizing.inlineHeight).toBe('')
  expect(resizing.animations).toBe(0)
  await clickText(panel, '添加条件')
  await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.condition-row').length)).toBe(2)
  await clickText(panel, '分析', '.workspace-tabs')
  await expect.poll(() => panel.evaluate(() => !!document.querySelector('.ranking-list .watch-button'))).toBe(true)
  const widthChange = await panel.evaluate(async () => {
    const button = document.querySelector<HTMLButtonElement>('.ranking-list .watch-button')!
    const widths: number[] = [button.getBoundingClientRect().width]
    button.click()
    for (let frame = 0; frame < 30; frame++) {
      await new Promise(requestAnimationFrame)
      widths.push(button.getBoundingClientRect().width)
    }
    return { widths, pressed: button.getAttribute('aria-pressed'), inlineWidth: button.style.width }
  })
  expect(widthChange.pressed).toBe('true')
  expect(new Set(widthChange.widths.map(Math.round)).size).toBeGreaterThan(2)
  expect(widthChange.inlineWidth).toBe('')
  await clickText(panel, '检索', '.workspace-tabs')
  await panel.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 780, deviceScaleFactor: 1, mobile: false })
  expect(await panel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const screenshot = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
  await writeFile(testInfo.outputPath('motion-narrow.png'), Buffer.from(screenshot.data, 'base64'))
})

test('减少动态效果时立即展开与切换，并取消正在执行的尺寸动画', async ({ extension }) => {
  const { panel } = extension
  // 先触发尺寸变化，再在途中切换系统偏好，验证 JS 动画也会停止。
  const running = await panel.evaluate(async () => {
    Array.from(document.querySelectorAll<HTMLButtonElement>('.workspace-tabs button')).find(button => button.textContent?.trim() === '检索')!.click()
    await new Promise(requestAnimationFrame)
    return document.querySelector('.feature-primary')!.getAnimations().length
  })
  expect(running).toBeGreaterThan(0)
  await panel.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await expect.poll(() => panel.evaluate(() => document.querySelector('.feature-primary')!.getAnimations().length)).toBe(0)
  await clickText(panel, '数据', '.workspace-tabs')
  const immediate = await panel.evaluate(async () => {
    document.querySelector<HTMLButtonElement>('[aria-label="展开 sample"]')!.click()
    for (let frame = 0; frame < 3; frame++)
      await new Promise(requestAnimationFrame)
    const toggle = document.querySelector('[aria-label="折叠 sample"]')!
    const children = toggle.closest('.tree-node')!.querySelector<HTMLElement>(':scope > .tree-children')!
    return { height: children.getBoundingClientRect().height, animations: children.getAnimations({ subtree: true }).length, inert: children.inert }
  })
  expect(immediate.height).toBeGreaterThan(100)
  expect(immediate.animations).toBe(0)
  expect(immediate.inert).toBe(false)
  await panel.click('[aria-label="折叠 sample"]')
  await expect.poll(() => panel.text()).not.toContain('Nuxt 3.17.5')
  await clickText(panel, '检索', '.workspace-tabs')
  expect(await panel.evaluate(() => document.querySelector('.feature-primary')!.getAnimations().length)).toBe(0)
})

test('来源卡片收起结束时外边距不再造成高度跳变', async ({ extension }) => {
  const { panel } = extension
  await panel.click('[aria-label="页面与数据来源"]')
  await panel.click('.source-details > .ui-disclosure-trigger')
  await panel.evaluate(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))
  })
  for (const width of [320, 800]) {
    await panel.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    const collapsed = await panel.evaluate(() => document.querySelector('.source-details')!.getBoundingClientRect().height)
    await panel.click('.source-details > .ui-disclosure-trigger')
    await panel.evaluate(async () => {
      await Promise.all(document.querySelector('.source-details')!.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})))
    })
    const frames = await panel.evaluate(async () => {
      const source = document.querySelector<HTMLElement>('.source-details')!
      const frames: { height: number, hidden: boolean }[] = []
      source.querySelector<HTMLElement>('.ui-disclosure-trigger')!.click()
      const until = performance.now() + 400
      while (performance.now() < until) {
        await new Promise(requestAnimationFrame)
        frames.push({ height: source.getBoundingClientRect().height, hidden: !source.querySelector('.ui-disclosure-content > div') })
      }
      return frames
    })
    // 正文最后一个可见帧应已接近折叠高度，不能等隐藏时再突然移除外边距。
    const lastVisible = frames.filter(frame => !frame.hidden).at(-1)!
    expect(lastVisible).toBeDefined()
    expect(Math.abs(lastVisible.height - collapsed)).toBeLessThan(1)
    expect(frames.at(-1)!.hidden).toBe(true)
    expect(frames.at(-1)!.height).toBeCloseTo(collapsed, 1)
    for (let index = 1; index < frames.length; index++)
      expect(frames[index]!.height).toBeLessThanOrEqual(frames[index - 1]!.height + 0.1)
  }
})
