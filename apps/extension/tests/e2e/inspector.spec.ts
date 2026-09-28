import { Buffer } from 'node:buffer'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from './fixtures'

const base = 'http://127.0.0.1:4318'

test('真实侧边栏：类型、展开、搜索、复制、导出与主题', async ({ extension }, testInfo) => {
  const { panel, downloads, website } = extension
  await panel.click('[aria-label="展开 sample"]')
  await expect.poll(() => panel.text()).toContain('Nuxt 3.17.5')
  await expect.poll(() => panel.text()).toContain('99n')
  await panel.search('amount')
  await expect.poll(() => panel.text()).toContain('1 条匹配')
  await panel.click('.search-result .tree-actions button:last-child')
  await expect.poll(() => panel.text()).toContain('已复制带类型的数据')
  await website.bringToFront()
  const clipboard = await website.evaluate(() => navigator.clipboard.readText())
  expect(JSON.parse(clipboard).node.type).toBe('bigint')
  await panel.click('.search-result .tree-actions button:first-child')
  await website.bringToFront()
  await expect.poll(() => website.evaluate(() => navigator.clipboard.readText())).toContain('["amount"]')
  await panel.click('.viewer-toolbar > button')
  await expect.poll(async () => (await readdir(downloads)).filter(name => name.endsWith('.json')).length).toBe(1)
  const filename = (await readdir(downloads)).find(name => name.endsWith('.json'))!
  expect(JSON.parse(await readFile(path.join(downloads, filename), 'utf8')).format).toBe('page-inspector/v1')
  await panel.search('')
  await expect.poll(() => panel.evaluate(() => !!document.querySelector('.tree-container'))).toBe(true)
  await panel.click('[aria-label="展开 sample"]')
  await panel.select('[aria-label="界面主题"]', 'dark')
  await expect.poll(() => panel.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  await expect.poll(() => panel.evaluate(() => {
    const button = document.querySelector('.page-actions button')!
    return getComputedStyle(button).color === getComputedStyle(button.parentElement!).color
  })).toBe(true)
  // 等待主题颜色过渡完成，截图应反映稳定界面。
  await panel.evaluate(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))
  })
  const darkScreenshot = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
  await writeFile(testInfo.outputPath('sidepanel-dark.png'), Buffer.from(darkScreenshot.data, 'base64'))
  await panel.select('[aria-label="界面主题"]', 'light')
  await expect.poll(() => panel.evaluate(() => document.documentElement.dataset.theme)).toBe('light')
  await expect.poll(() => panel.evaluate(() => {
    const button = document.querySelector('.page-actions button')!
    return getComputedStyle(button).color === getComputedStyle(button.parentElement!).color
  })).toBe(true)
  // 等待主题颜色过渡完成，截图应反映稳定界面。
  await panel.evaluate(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))
  })
  const screenshot = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
  await writeFile(testInfo.outputPath('sidepanel-light.png'), Buffer.from(screenshot.data, 'base64'))
  expect(await panel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('字段展开热区、选区与拖动、键盘操作和独立复制', async ({ extension }) => {
  const { panel } = extension
  // 点击字段文字和摘要，验证热区已经覆盖箭头之外的内容。
  await panel.click('[aria-label="展开 sample"] .tree-key')
  await expect.poll(() => panel.text()).toContain('Nuxt 3.17.5')
  const target = await panel.evaluate(() => {
    const bounds = document.querySelector('[aria-label="折叠 sample"]')!.getBoundingClientRect()
    return { width: bounds.width, height: bounds.height }
  })
  expect(target.width).toBeGreaterThan(100)
  expect(target.height).toBeGreaterThanOrEqual(32)
  await panel.click('[aria-label="折叠 sample"] .tree-value')
  await expect.poll(() => panel.text()).not.toContain('Nuxt 3.17.5')

  // 已有选区不应屏蔽展开；真实鼠标轻微拖动也不能把分支字段名变成选中文字。
  await panel.evaluate(() => {
    const range = document.createRange()
    range.selectNodeContents(document.querySelector('.export-note')!)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
  })
  expect(await panel.evaluate(() => window.getSelection()?.toString())).toContain('视图导出')
  await panel.click('[aria-label="展开 sample"] .tree-key')
  await expect.poll(() => panel.text()).toContain('Nuxt 3.17.5')
  await panel.click('[aria-label="折叠 sample"] .tree-indicator')
  await expect.poll(() => panel.text()).not.toContain('Nuxt 3.17.5')
  await panel.evaluate(() => {
    window.getSelection()?.removeAllRanges()
    document.querySelector('[aria-label="展开 sample"]')!.scrollIntoView({ block: 'center' })
  })
  const text = await panel.evaluate(() => {
    const bounds = document.querySelector('[aria-label="展开 sample"] .tree-key')!.getBoundingClientRect()
    return { x: bounds.left + 3, y: bounds.top + bounds.height / 2 }
  })
  await panel.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...text, button: 'left', clickCount: 1 })
  await panel.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: text.x + 7, y: text.y, button: 'left', buttons: 1 })
  await panel.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: text.x + 7, y: text.y, button: 'left', clickCount: 1 })
  await expect.poll(() => panel.text()).toContain('Nuxt 3.17.5')
  expect(await panel.evaluate(() => window.getSelection()?.toString())).toBe('')
  expect(await panel.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('折叠 sample')

  // 展开会改变滚动位置，重新定位后验证双击事件不会产生字段名选区。
  const doubleClickTarget = await panel.evaluate(() => {
    const field = document.querySelector('[aria-label="折叠 sample"] .tree-key')!
    field.scrollIntoView({ block: 'center' })
    const bounds = field.getBoundingClientRect()
    return { x: bounds.left + 3, y: bounds.top + bounds.height / 2 }
  })
  await panel.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...doubleClickTarget, button: 'left', clickCount: 2 })
  await panel.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...doubleClickTarget, button: 'left', clickCount: 2 })
  await expect.poll(() => panel.text()).not.toContain('Nuxt 3.17.5')
  expect(await panel.evaluate(() => window.getSelection()?.toString())).toBe('')

  await panel.evaluate(() => document.querySelector<HTMLButtonElement>('[aria-label="展开 sample"]')!.focus())
  expect(await panel.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('展开 sample')
  // CDP 按键同时提供字符数据，才能触发原生按钮的 Enter 默认动作。
  await panel.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' })
  await panel.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await expect.poll(() => panel.text()).toContain('Nuxt 3.17.5')

  await panel.click('.tree-row:has(> [aria-label="折叠 sample"]) > .tree-actions button:last-child')
  await expect.poll(() => panel.text()).toContain('已复制带类型的数据')
  expect(await panel.evaluate(() => document.querySelector('[aria-label="折叠 sample"]')?.getAttribute('aria-expanded'))).toBe('true')

  await panel.evaluate(() => document.querySelector<HTMLButtonElement>('[aria-label="折叠 sample"]')!.focus())
  await panel.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ', unmodifiedText: ' ' })
  await panel.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
  await expect.poll(() => panel.text()).not.toContain('Nuxt 3.17.5')
})

test('外部 payload、原文高亮与原文导出', async ({ extension }) => {
  const { website, panel, downloads } = extension
  await website.goto(`${base}/external`)
  await expect.poll(() => panel.text()).toContain('sample')
  await panel.click('[aria-label="展开 sample"]')
  await expect.poll(() => panel.text()).toContain('Nuxt 4.0.0')
  await panel.click('.view-tabs button:last-child')
  await panel.select('[aria-label="原文来源"]', '1')
  await expect.poll(() => panel.evaluate(() => !!document.querySelector('.shiki'))).toBe(true)
  await panel.click('.viewer-toolbar > button')
  await expect.poll(async () => (await readdir(downloads)).filter(name => name.endsWith('.json')).length).toBe(1)
  const filename = (await readdir(downloads)).find(name => name.endsWith('.json'))!
  const original = await readFile(new URL('../fixtures/nuxt/nuxt-4.0.0.json', import.meta.url), 'utf8')
  expect(await readFile(path.join(downloads, filename), 'utf8')).toBe(original)
})

test('快速切换标签页、空页面、导航和重新读取', async ({ extension }) => {
  const { context, website, panel } = extension
  const previous = await (await context.request.get(`${base}/stats`)).json()
  await website.goto(`${base}/slow`)
  await expect.poll(async () => (await (await context.request.get(`${base}/stats`)).json()).slowStarted).toBeGreaterThan(previous.slowStarted)
  const other = await context.newPage()
  await other.goto(`${base}/empty`)
  await expect.poll(() => panel.text()).toContain('未检测到 Nuxt 数据')
  // 服务端确认慢响应结束后再次检查，避免仅在旧结果到达之前断言。
  await expect.poll(async () => (await (await context.request.get(`${base}/stats`)).json()).slowCompleted).toBeGreaterThan(previous.slowCompleted)
  expect(await panel.text()).toContain('未检测到 Nuxt 数据')
  await website.bringToFront()
  await website.goto(`${base}/inline`)
  await expect.poll(() => panel.text()).toContain('sample')
  await website.locator('button').click()
  await expect.poll(() => panel.text()).toContain('初始文档快照')
  await panel.click('.page-actions button')
  await expect.poll(() => panel.text()).toContain('sample')
  await expect.poll(() => panel.text()).toContain('初始文档快照')
  await website.reload()
  await expect.poll(() => panel.text()).toContain('sample')
  await expect.poll(() => panel.text()).not.toContain('页面地址已变化')
})

test('错误原文、外部失败降级、多应用切换', async ({ extension }) => {
  const { website, panel } = extension
  await website.goto(`${base}/broken`)
  await expect.poll(() => panel.text()).toContain('解析失败')
  await panel.click('.view-tabs button:last-child')
  await expect.poll(() => panel.text()).toContain('broken')
  await website.goto(`${base}/missing`)
  await expect.poll(() => panel.text()).toContain('404')
  await panel.click('.view-tabs button:first-child')
  await expect.poll(() => panel.text()).toContain('inlineOnly')
  await website.goto(`${base}/multi`)
  await expect.poll(() => panel.evaluate(() => !!document.querySelector('.field-label select'))).toBe(true)
  await panel.select('.field-label select', '1')
  await panel.click('[aria-label="展开 sample"]')
  await expect.poll(() => panel.text()).toContain('Nuxt 4.0.0')
})

test('大数据限制不隐藏状态分类，窄侧栏可用', async ({ extension }, testInfo) => {
  const { website, panel } = extension
  await website.goto(`${base}/large`)
  await expect.poll(() => panel.text()).toContain('已限制为 10,000')
  await panel.click('.view-tabs button:nth-child(2)')
  await expect.poll(() => panel.text()).toContain('available')
  await expect.poll(() => panel.text()).not.toContain('已限制为 10,000')
  await panel.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 780, deviceScaleFactor: 1, mobile: false })
  expect(await panel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  // 等待分类选中态的颜色过渡结束，避免截图保留上一分类的标记。
  await panel.evaluate(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))
  })
  const screenshot = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
  await writeFile(testInfo.outputPath('sidepanel-narrow.png'), Buffer.from(screenshot.data, 'base64'))
})

test('重新读取保留内容、展开状态与搜索，并稳定显示加载反馈', async ({ extension }) => {
  const { panel } = extension
  await panel.click('[aria-label="展开 sample"]')
  await expect.poll(() => panel.text()).toContain('Nuxt 3.17.5')
  await panel.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('.page-actions button')!
    const tree = document.querySelector('.tree-container > .tree-node')!
    const workbench = document.querySelector('[aria-label="扩展工作区"]')!
    const initialWidth = button.getBoundingClientRect().width
    const probe = { started: 0, elapsed: 0, preserved: true, stableWidth: true }
    const observer = new MutationObserver(() => {
      if (!probe.started && button.disabled)
        probe.started = performance.now()
      if (!probe.started)
        return
      probe.preserved &&= tree.isConnected && getComputedStyle(workbench).display !== 'none'
        && !document.querySelector('.empty-state')
      probe.stableWidth &&= button.getBoundingClientRect().width === initialWidth
      if (!button.disabled) {
        probe.elapsed = performance.now() - probe.started
        document.documentElement.dataset.refreshProbe = JSON.stringify(probe)
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
  })
  await panel.click('.page-actions button')
  expect(await panel.evaluate(() => document.querySelector<HTMLButtonElement>('.page-actions button')?.disabled)).toBe(true)
  await expect.poll(() => panel.evaluate(() => document.documentElement.dataset.refreshProbe)).toBeTruthy()
  const probe = await panel.evaluate(() => JSON.parse(document.documentElement.dataset.refreshProbe!))
  expect(probe.elapsed).toBeGreaterThanOrEqual(380)
  expect(probe.preserved).toBe(true)
  expect(probe.stableWidth).toBe(true)
  expect(await panel.evaluate(() => document.querySelector('[aria-label="折叠 sample"]')?.getAttribute('aria-expanded'))).toBe('true')
  await panel.search('amount')
  await expect.poll(() => panel.text()).toContain('1 条匹配')
  await panel.click('.page-actions button')
  await expect.poll(() => panel.evaluate(() => document.querySelector<HTMLButtonElement>('.page-actions button')?.disabled)).toBe(false)
  expect(await panel.evaluate(() => document.querySelector<HTMLInputElement>('input[type="search"]')?.value)).toBe('amount')
  expect(await panel.text()).toContain('1 条匹配')
})
