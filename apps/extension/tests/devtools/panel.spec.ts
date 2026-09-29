import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, expect, test } from '@playwright/test'
import { clickText, fillField, SidePanel } from '../e2e/fixtures'
// 探针只连接浏览器创建的真实 DevTools 前端／面板，不创建带模拟 API 的普通扩展页。
test('真实 DevTools 注册、固定标签页、HAR 事件与正文读取', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const extensionPath = path.resolve('.output/chrome-mv3-prod')
  const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, viewport: { width: 1500, height: 1000 }, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--auto-open-devtools-for-tabs'] })
  try {
    const website = context.pages()[0] || await context.newPage()
    await website.goto('http://127.0.0.1:4318/external')
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
    const extensionId = new URL(worker.url()).host
    const cdp = await context.newCDPSession(website)
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'http://127.0.0.1:4318/external' }))[0]!.id!)
    let frontendId = ''
    await expect.poll(async () => {
      const targets = (await cdp.send('Target.getTargets')).targetInfos
      frontendId = targets.find(target => target.url.startsWith('devtools://'))?.targetId ?? ''
      return frontendId
    }).toBeTruthy()
    const frontendSession = await cdp.send('Target.attachToTarget', { targetId: frontendId, flatten: false })
    const frontend = new SidePanel(cdp, frontendSession.sessionId)
    await frontend.send('Runtime.enable')
    await frontend.send('Page.enable')
    // 原生溢出菜单不属于页面 DOM；用 DevTools 快捷键轮换页签，等待真实面板目标创建。
    let targetId = ''
    await expect.poll(async () => {
      const targets = (await cdp.send('Target.getTargets')).targetInfos
      targetId = targets.find(target => target.url === `chrome-extension://${extensionId}/inspector-panel.html`)?.targetId ?? ''
      if (!targetId) {
        await frontend.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ']', code: 'BracketRight', modifiers: 2, windowsVirtualKeyCode: 221 })
        await frontend.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ']', code: 'BracketRight', modifiers: 2, windowsVirtualKeyCode: 221 })
      }
      return targetId
    }, { intervals: [300] }).toBeTruthy()
    const panelSession = await cdp.send('Target.attachToTarget', { targetId, flatten: false })
    const panel = new SidePanel(cdp, panelSession.sessionId)
    await panel.send('Runtime.enable')
    await panel.send('Page.enable')
    expect(await panel.evaluate(() => chrome.devtools.inspectedWindow.tabId)).toBe(tabId)
    expect(await panel.evaluate(() => typeof chrome.devtools.network.getHAR)).toBe('function')
    await expect.poll(() => panel.text()).toContain('sample')
    // 宿主视口不等于嵌入面板宽度，按真实容器验证方向和键盘调节。
    const splitSizes = { horizontal: 64, vertical: 50 }
    for (const width of [900, 560]) {
      await frontend.send('Emulation.setDeviceMetricsOverride', { width, height: 780, deviceScaleFactor: 1, mobile: false })
      await panel.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      const orientation = await panel.evaluate(() => document.querySelector('.data-explorer')!.clientWidth >= 600 ? 'horizontal' : 'vertical')
      const initial = splitSizes[orientation]
      await expect.poll(() => panel.evaluate(() => ({ orientation: document.querySelector('.ui-split-handle')?.getAttribute('data-orientation'), size: Number(document.querySelector('.ui-split-handle')?.getAttribute('aria-valuenow')) }))).toEqual({ orientation, size: initial })
      await panel.evaluate(() => document.querySelector<HTMLElement>('.ui-split-handle')!.focus())
      const key = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
      const keyCode = orientation === 'horizontal' ? 39 : 40
      await panel.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: keyCode })
      await panel.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: keyCode })
      await expect.poll(() => panel.evaluate(() => Number(document.querySelector('.ui-split-handle')?.getAttribute('aria-valuenow')))).toBe(initial + 1)
      splitSizes[orientation] = initial + 1
    }
    await frontend.send('Emulation.clearDeviceMetricsOverride')
    await expect.poll(() => panel.evaluate((sizes) => {
      const orientation = document.querySelector('.data-explorer')!.clientWidth >= 600 ? 'horizontal' : 'vertical'
      return Number(document.querySelector('.ui-split-handle')?.getAttribute('aria-valuenow')) === sizes[orientation]
    }, splitSizes)).toBe(true)
    await clickText(panel, '网络', '.workspace-tabs')
    await website.evaluate(async () => {
      await fetch('/_payload.json?proof=1')
      await fetch('/_payload.json?proof=1')
    })
    await expect.poll(() => panel.evaluate(() => [...document.querySelectorAll('.request-row')].filter(row => row.textContent?.includes('_payload.json?proof=1')).length)).toBe(2)
    await panel.evaluate(() => ([...document.querySelectorAll<HTMLButtonElement>('.request-row')].find(row => row.textContent?.includes('_payload.json?proof=1')))!.click())
    await clickText(panel, '读取响应正文')
    await expect.poll(() => panel.evaluate(() => document.querySelector('.response-preview')?.textContent)).toContain('Nuxt 4.0.0')
    await expect.poll(() => panel.evaluate(() => document.querySelector('.network-detail')?.textContent)).toContain('无法关联')
    // 窄 DevTools 只滚动网络模块，页面根节点和主布局都不能滚动或预留右侧空槽。
    // 扩展面板是嵌入目标，视口模拟只能作用于 DevTools 宿主目标。
    await frontend.send('Emulation.setDeviceMetricsOverride', { width: 560, height: 640, deviceScaleFactor: 1, mobile: false })
    await panel.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    expect(await panel.evaluate(() => {
      const network = document.querySelector('.network-card')!
      const main = document.querySelector('.inspector-main')!
      network.scrollTop = network.scrollHeight
      main.scrollTop = 100
      document.scrollingElement!.scrollTop = 100
      return network.scrollTop > 0 && main.scrollTop === 0 && document.scrollingElement!.scrollTop === 0
        && main.scrollHeight <= main.clientHeight + 1
        && Math.abs(document.querySelector('.inspector-shell')!.getBoundingClientRect().right - innerWidth) < 1
        && Math.abs(document.querySelector('.workspace-footer')!.getBoundingClientRect().bottom - innerHeight) < 1
    })).toBe(true)
    await frontend.send('Emulation.clearDeviceMetricsOverride')
    // 相同完整 URL 的正文可对照；HAR 无导航证据时必须保留候选等级。
    await website.evaluate(async () => {
      await fetch('/_payload.json')
    })
    await expect.poll(() => panel.evaluate(() => [...document.querySelectorAll('.request-row')].some(row => row.textContent?.includes('来源候选')))).toBe(true)
    await panel.evaluate(() => ([...document.querySelectorAll<HTMLButtonElement>('.request-row')].find(row => row.textContent?.includes('来源候选')))!.click())
    await clickText(panel, '读取响应正文')
    await expect.poll(() => panel.evaluate(() => document.querySelector('.response-preview')?.textContent)).toContain('Nuxt 4.0.0')
    await clickText(panel, '作为独立 payload 查看')
    await expect.poll(() => panel.text()).toContain('当前查看显式选择的浏览器响应')
    await clickText(panel, '返回页面快照')
    const other = await context.newPage()
    await other.goto('http://127.0.0.1:4318/empty')
    await other.bringToFront()
    expect(await panel.evaluate(() => chrome.devtools.inspectedWindow.tabId)).toBe(tabId)
    expect(await panel.evaluate(() => document.querySelector('.page-url')?.textContent)).toContain('/external')
    await website.bringToFront()
    await website.goto('http://127.0.0.1:4318/features?slow-document=1')
    await expect.poll(() => panel.text()).toContain('feature-lab')
    await clickText(panel, '网络', '.workspace-tabs')
    await expect.poll(() => panel.evaluate(() => [...document.querySelectorAll('.request-row')].some(row => row.textContent?.includes('proof=1')))).toBe(false)
    // 请求在导航通知前已等待两秒，仍应保留本次主文档；不能按通知到达时间误删。
    await expect.poll(() => panel.evaluate(() => [...document.querySelectorAll('.request-row')].some(row => row.textContent?.includes('/features?slow-document=1')))).toBe(true)
    // 切换普通标签页后重新激活 DevTools，并等候绘制，避免截图仍使用后台的旧画面。
    await frontend.send('Page.bringToFront')
    await panel.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const screenshot = await frontend.send<{
      data: string
    }>('Page.captureScreenshot', { format: 'png' })
    await writeFile(testInfo.outputPath('devtools-network.png'), Buffer.from(screenshot.data, 'base64'))
    // 原页面没有 payload 时，已读取的合法响应仍能独立查看、分析和查询。
    await clickText(panel, '数据', '.workspace-tabs')
    await clickText(panel, '状态', '.view-tabs')
    await website.goto('http://127.0.0.1:4318/empty')
    await expect.poll(() => panel.text()).toContain('未检测到 Nuxt 数据')
    await clickText(panel, '网络', '.workspace-tabs')
    await website.evaluate(async () => {
      await fetch('/_payload.json?independent=1')
    })
    await expect.poll(() => panel.evaluate(() => [...document.querySelectorAll('.request-row')].some(row => row.textContent?.includes('independent=1')))).toBe(true)
    await panel.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('.request-row')].find(row => row.textContent?.includes('independent=1'))!.click())
    await clickText(panel, '读取响应正文')
    await expect.poll(() => panel.evaluate(() => document.querySelector('.response-preview')?.textContent)).toContain('Nuxt 4.0.0')
    await clickText(panel, '作为独立 payload 查看')
    await expect.poll(() => panel.evaluate(() => document.querySelector('.capture-status')?.textContent)).toBe('浏览器响应')
    expect(await panel.evaluate(() => ({
      visible: getComputedStyle(document.querySelector('[aria-label="扩展工作区"]')!).display !== 'none',
      content: document.querySelector('.tree-container')?.textContent,
      selected: document.querySelector('.view-tabs [aria-selected="true"]')?.textContent?.trim(),
      empty: !!document.querySelector('.empty-state'),
    }))).toEqual({ visible: true, content: expect.stringContaining('sample'), selected: '数据', empty: false })
    await clickText(panel, '分析', '.workspace-tabs')
    await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.ranking-row').length)).toBeGreaterThan(0)
    await clickText(panel, '检索', '.workspace-tabs')
    await fillField(panel, '[aria-label="条件 1 内容"]', 'sample.title')
    await clickText(panel, '执行查询')
    await expect.poll(() => panel.evaluate(() => document.querySelector('.query-result-status')?.textContent)).toContain('1 条匹配')
    await clickText(panel, '返回页面快照')
    await expect.poll(() => panel.text()).toContain('未检测到 Nuxt 数据')
    expect(await panel.evaluate(() => getComputedStyle(document.querySelector('[aria-label="扩展工作区"]')!).display)).toBe('none')
    expect(await panel.text()).not.toContain('当前查看显式选择的浏览器响应')

    // 返回页面快照时还原先前选择的应用，不能被独立响应的应用下标覆盖。
    await website.goto('http://127.0.0.1:4318/multi')
    await expect.poll(() => panel.evaluate(() => document.querySelectorAll('.field-label select > option').length)).toBe(2)
    await panel.select('[role="combobox"][aria-label="应用"]', '1')
    await clickText(panel, '网络', '.workspace-tabs')
    await website.evaluate(async () => {
      await fetch('/_payload.json?independent=2')
    })
    await expect.poll(() => panel.evaluate(() => [...document.querySelectorAll('.request-row')].some(row => row.textContent?.includes('independent=2')))).toBe(true)
    await panel.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('.request-row')].find(row => row.textContent?.includes('independent=2'))!.click())
    await clickText(panel, '读取响应正文')
    await expect.poll(() => panel.evaluate(() => document.querySelector('.response-preview')?.textContent)).toContain('Nuxt 4.0.0')
    await clickText(panel, '作为独立 payload 查看')
    await expect.poll(() => panel.text()).toContain('当前查看显式选择的浏览器响应')
    await clickText(panel, '返回页面快照')
    expect(await panel.evaluate(() => document.querySelector('[role="combobox"][aria-label="应用"]')?.getAttribute('data-value'))).toBe('1')
    expect(panel.exceptions).toEqual([])
    await writeFile(testInfo.outputPath('probe.json'), JSON.stringify({ browser: context.browser()?.version(), extensionId, inspectedTabId: tabId, panelUrl: `chrome-extension://${extensionId}/inspector-panel.html`, realDevTools: true }, null, 2))
  }
  finally {
    await context.close()
  }
})
