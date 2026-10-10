import path from 'node:path'
import { chromium, expect, test } from '@playwright/test'
import { clickText, SidePanel } from '../e2e/fixtures'
// 探针只连接浏览器创建的真实 DevTools 前端／面板，不创建带模拟 API 的普通扩展页。
test('SEO 真实文档响应：分别查看 DOM / HTML，导航后清理旧内容', async ({
  browserName,
}) => {
  expect(browserName).toBe('chromium')
  const extensionPath = path.resolve('.output/chrome-mv3-prod')
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1500, height: 1000 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--auto-open-devtools-for-tabs',
    ],
  })
  try {
    const website = context.pages()[0] || (await context.newPage())
    await website.goto('http://127.0.0.1:4318/seo')
    const worker
      = context.serviceWorkers()[0]
        || (await context.waitForEvent('serviceworker'))
    const extensionId = new URL(worker.url()).host
    const cdp = await context.newCDPSession(website)
    const tabId = await worker.evaluate(
      async () =>
        (await chrome.tabs.query({ url: 'http://127.0.0.1:4318/seo' }))[0]!.id!,
    )
    let frontendId = ''
    await expect
      .poll(async () => {
        const targets = (await cdp.send('Target.getTargets')).targetInfos
        frontendId
          = targets.find(target => target.url.startsWith('devtools://'))
            ?.targetId ?? ''
        return frontendId
      })
      .toBeTruthy()
    const frontendSession = await cdp.send('Target.attachToTarget', {
      targetId: frontendId,
      flatten: false,
    })
    const frontend = new SidePanel(cdp, frontendSession.sessionId)
    await frontend.send('Runtime.enable')
    await frontend.send('Page.enable')
    // 原生溢出菜单不属于页面 DOM；用 DevTools 快捷键轮换页签，等待真实面板目标创建。
    let targetId = ''
    await expect
      .poll(
        async () => {
          const targets = (await cdp.send('Target.getTargets')).targetInfos
          targetId
            = targets.find(
              target =>
                target.url
                === `chrome-extension://${extensionId}/inspector-panel.html`,
            )?.targetId ?? ''
          if (!targetId) {
            await frontend.send('Input.dispatchKeyEvent', {
              type: 'keyDown',
              key: ']',
              code: 'BracketRight',
              modifiers: 2,
              windowsVirtualKeyCode: 221,
            })
            await frontend.send('Input.dispatchKeyEvent', {
              type: 'keyUp',
              key: ']',
              code: 'BracketRight',
              modifiers: 2,
              windowsVirtualKeyCode: 221,
            })
          }
          return targetId
        },
        { intervals: [300] },
      )
      .toBeTruthy()
    const panelSession = await cdp.send('Target.attachToTarget', {
      targetId,
      flatten: false,
    })
    const panel = new SidePanel(cdp, panelSession.sessionId)
    await panel.send('Runtime.enable')
    await panel.send('Page.enable')
    expect(
      await panel.evaluate(() => chrome.devtools.inspectedWindow.tabId),
    ).toBe(tabId)
    expect(
      await panel.evaluate(() => typeof chrome.devtools.network.getHAR),
    ).toBe('function')
    await clickText(panel, 'SEO', '.workspace-tabs')
    await expect
      .poll(() =>
        panel.evaluate(
          () => document.querySelector('[data-key="title"]')?.textContent,
        ),
      )
      .toContain('SEO 客户端标题')
    await website.reload()
    await expect(website).toHaveTitle('SEO 客户端标题')
    await panel.select('[aria-label="SEO 数据来源"]', 'html')
    await clickText(panel, '读取 HTML')
    await expect.poll(() => panel.evaluate(() => document.querySelector('[data-key="title"]')?.textContent)).toContain('SEO 服务端标题')
    expect(await panel.evaluate(() => document.querySelector('[data-change]'))).toBeNull()
    await panel.select('[aria-label="SEO 数据来源"]', 'dom')
    await expect.poll(() => panel.evaluate(() => document.querySelector('[data-key="title"]')?.textContent)).toContain('SEO 客户端标题')
    await website.goto('http://127.0.0.1:4318/empty')
    await panel.select('[aria-label="SEO 数据来源"]', 'html')
    await expect.poll(() => panel.text()).toContain('点击读取 HTML')
    expect(await panel.evaluate(() => document.querySelector('[data-key="title"]'))).toBeNull()
    expect(panel.exceptions).toEqual([])
  }
  finally {
    await context.close()
  }
})
