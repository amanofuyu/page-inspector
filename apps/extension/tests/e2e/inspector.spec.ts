import { Buffer } from 'node:buffer'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { clickText, expect, test } from './fixtures'

const base = 'http://127.0.0.1:4318'

test('真实侧边栏：类型、展开、搜索、复制、导出与主题', async ({ extension }, testInfo) => {
  const { panel, downloads, website } = extension
  await panel.click('.data-tree-pane [aria-label="展开 sample"]')
  await expect.poll(() => panel.text()).toContain('Nuxt 3.17.5')
  await expect.poll(() => panel.text()).toContain('99n')
  await panel.search('amount')
  await expect.poll(() => panel.text()).toContain('1 条匹配')
  await panel.click('.search-result .tree-select')
  await expect.poll(() => panel.evaluate(() => document.querySelector('#data-field-detail')?.getAttribute('aria-busy'))).toBe('false')
  await panel.click('#data-field-detail [title="复制带类型的数据"]')
  await expect.poll(() => panel.text()).toContain('已复制带类型的数据')
  await website.bringToFront()
  const clipboard = await website.evaluate(() => navigator.clipboard.readText())
  expect(JSON.parse(clipboard).node.type).toBe('bigint')
  await panel.click('#data-field-detail [title="复制字段路径"]')
  await website.bringToFront()
  await expect.poll(() => website.evaluate(() => navigator.clipboard.readText())).toContain('["amount"]')
  await panel.click('.export-button')
  await expect.poll(async () => (await readdir(downloads)).filter(name => name.endsWith('.json')).length).toBe(1)
  const filename = (await readdir(downloads)).find(name => name.endsWith('.json'))!
  expect(JSON.parse(await readFile(path.join(downloads, filename), 'utf8')).format).toBe('page-inspector/v1')
  await panel.search('')
  await expect.poll(() => panel.evaluate(() => !!document.querySelector('.tree-container'))).toBe(true)
  await panel.click('.data-tree-pane [aria-label="展开 sample"]')
  await panel.select('[aria-label="界面主题"]', 'dark')
  await expect.poll(() => panel.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  await expect.poll(() => panel.evaluate(() => {
    const button = document.querySelector('.refresh-button')!
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
    const button = document.querySelector('.refresh-button')!
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

test('字段选择与展开独立，键盘操作、复制和宽窄布局可用', async ({ extension }, testInfo) => {
  const { panel } = extension
  await panel.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 780, deviceScaleFactor: 1, mobile: false })
  const sample = '.data-tree-pane .tree-row:has(> [aria-label="展开 sample"]) .tree-select'
  await panel.click(sample)
  await expect.poll(() => panel.evaluate(() => document.querySelector('.detail-field-name')?.textContent?.trim())).toBe('sample')
  expect(await panel.evaluate(() => document.querySelector('.data-tree-pane [aria-label="展开 sample"]')?.getAttribute('aria-expanded'))).toBe('false')
  expect(await panel.evaluate(() => document.querySelector('.data-tree-pane .tree-select[aria-pressed="true"] .tree-key')?.textContent)).toBe('sample')

  // 箭头负责展开，字段按钮只选择详情；两者均保留原生键盘行为。
  await panel.evaluate(() => document.querySelector<HTMLButtonElement>('.data-tree-pane [aria-label="展开 sample"]')!.focus())
  await panel.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' })
  await panel.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await expect.poll(() => panel.evaluate(() => document.querySelector('.data-tree-pane')?.textContent)).toContain('Nuxt 3.17.5')
  await expect.poll(() => panel.evaluate(() => document.querySelector('#data-field-detail')?.getAttribute('aria-busy'))).toBe('false')
  await panel.click('#data-field-detail [title="复制带类型的数据"]')
  await expect.poll(() => panel.text()).toContain('已复制带类型的数据')
  expect(await panel.evaluate(() => document.querySelector('.data-tree-pane [aria-label="折叠 sample"]')?.getAttribute('aria-expanded'))).toBe('true')
  await panel.evaluate(() => document.querySelector<HTMLButtonElement>('.data-tree-pane [aria-label="折叠 sample"]')!.focus())
  await panel.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ', unmodifiedText: ' ' })
  await panel.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
  await expect.poll(() => panel.evaluate(() => document.querySelector('.data-tree-pane')?.textContent)).not.toContain('Nuxt 3.17.5')

  // 内容优先：首行数据靠近顶部，底部导航固定，宽屏分栏且窄屏上下排列。
  expect(await panel.evaluate(() => {
    const tree = document.querySelector('.data-tree-pane')!.getBoundingClientRect()
    const detail = document.querySelector('#data-field-detail')!.getBoundingClientRect()
    const footer = document.querySelector('.workspace-footer')!.getBoundingClientRect()
    return tree.top < 200 && detail.left >= tree.right && Math.abs(footer.bottom - innerHeight) < 1
      && document.documentElement.scrollWidth <= innerWidth
  })).toBe(true)
  await panel.click('.toast-close')
  await panel.click('.data-tree-pane [aria-label="展开 sample"]')
  await panel.evaluate(() => document.querySelector('.detail-pane-body')!.scrollTo(0, 0))
  await panel.select('[aria-label="界面主题"]', 'light')
  await panel.evaluate(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))
  })
  const wide = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
  await writeFile(testInfo.outputPath('focus-layout-wide.png'), Buffer.from(wide.data, 'base64'))
  await panel.click('[aria-label="收起字段详情"]')
  expect(await panel.evaluate(() => document.querySelector('#data-field-detail'))).toBeNull()
  await panel.click('.detail-toggle')
  await expect.poll(() => panel.evaluate(() => document.querySelector('.detail-field-name')?.textContent?.trim())).toBe('sample')
  await expect.poll(() => panel.evaluate(() => document.querySelector('#data-field-detail')?.getAttribute('aria-busy'))).toBe('false')
  await panel.click('.data-tree-pane [aria-label="折叠 sample"]')
  await panel.evaluate(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))
  })
  await panel.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 780, deviceScaleFactor: 1, mobile: false })
  expect(await panel.evaluate(() => {
    const tree = document.querySelector('.data-tree-pane')!.getBoundingClientRect()
    const detail = document.querySelector('#data-field-detail')!.getBoundingClientRect()
    const footer = document.querySelector('.workspace-footer')!.getBoundingClientRect()
    return detail.top >= tree.bottom && Math.abs(footer.bottom - innerHeight) < 1
      && document.documentElement.scrollWidth <= innerWidth
  })).toBe(true)
  const narrow = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
  await writeFile(testInfo.outputPath('focus-layout-narrow.png'), Buffer.from(narrow.data, 'base64'))
  await clickText(panel, '检索', '.workspace-tabs')
  expect(await panel.evaluate(() => document.querySelector('.field-detail'))).toBeNull()
  await clickText(panel, '数据', '.workspace-tabs')
  await expect.poll(() => panel.evaluate(() => document.querySelector('#data-field-detail')?.textContent)).toContain('字段来源：')
  expect(await panel.evaluate(() => document.querySelector('.detail-field-name')?.textContent?.trim())).toBe('sample')
  await panel.click('[aria-label="页面与数据来源"]')
  expect(await panel.evaluate(() => document.querySelector('#page-context')!.matches(':modal'))).toBe(true)
})

test('外部 payload、原文高亮与原文导出', async ({ extension }) => {
  const { website, panel, downloads } = extension
  await website.goto(`${base}/external`)
  await expect.poll(() => panel.text()).toContain('sample')
  await panel.click('.data-tree-pane [aria-label="展开 sample"]')
  await expect.poll(() => panel.text()).toContain('Nuxt 4.0.0')
  await panel.click('.view-tabs button:last-child')
  await panel.select('[aria-label="原文来源"]', '1')
  await expect.poll(() => panel.evaluate(() => !!document.querySelector('.shiki'))).toBe(true)
  await panel.click('.export-button')
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
  await panel.click('.refresh-button')
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
  await panel.click('.data-tree-pane [aria-label="展开 sample"]')
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
  await panel.click('.data-tree-pane [aria-label="展开 sample"]')
  await expect.poll(() => panel.text()).toContain('Nuxt 3.17.5')
  await panel.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('.refresh-button')!
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
  await panel.click('.refresh-button')
  expect(await panel.evaluate(() => document.querySelector<HTMLButtonElement>('.refresh-button')?.disabled)).toBe(true)
  await expect.poll(() => panel.evaluate(() => document.documentElement.dataset.refreshProbe)).toBeTruthy()
  const probe = await panel.evaluate(() => JSON.parse(document.documentElement.dataset.refreshProbe!))
  expect(probe.elapsed).toBeGreaterThanOrEqual(380)
  expect(probe.preserved).toBe(true)
  expect(probe.stableWidth).toBe(true)
  expect(await panel.evaluate(() => document.querySelector('[aria-label="折叠 sample"]')?.getAttribute('aria-expanded'))).toBe('true')
  await panel.search('amount')
  await expect.poll(() => panel.text()).toContain('1 条匹配')
  await panel.click('.refresh-button')
  await expect.poll(() => panel.evaluate(() => document.querySelector<HTMLButtonElement>('.refresh-button')?.disabled)).toBe(false)
  expect(await panel.evaluate(() => document.querySelector<HTMLInputElement>('input[type="search"]')?.value)).toBe('amount')
  expect(await panel.text()).toContain('1 条匹配')
})
