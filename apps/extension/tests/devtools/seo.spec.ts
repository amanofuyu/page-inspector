import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, expect, test } from '@playwright/test'
import { clickText, fillField, SidePanel } from '../e2e/fixtures'
// 探针只连接浏览器创建的真实 DevTools 前端／面板，不创建带模拟 API 的普通扩展页。
test('SEO 真实文档响应：SSR／CSR 差异、报告和 SPA 基线隔离', async ({
  browserName,
}, testInfo) => {
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
    await clickText(panel, '刷新并捕获 HTML')
    await expect
      .poll(
        () =>
          panel.evaluate(
            () => document.querySelector('.seo-source > summary')?.textContent,
          ),
        { timeout: 15000 },
      )
      .toContain('已关联本次文档响应')
    const changes = await panel.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll('.seo-row')].map(row => [
          row.getAttribute('data-key'),
          row.getAttribute('data-change'),
        ]),
      ),
    )
    expect(changes).toMatchObject({
      'title': 'changed',
      'meta:description': 'changed',
      'meta:robots': 'removed',
      'meta:twitter:card': 'added',
      'link:canonical': 'initial',
      'http:x-robots-tag': 'transport',
      'http:canonical': 'transport',
    })
    await fillField(panel, '[aria-label="搜索 SEO 字段"]', 'title')
    await panel.click('[data-key="title"] > .seo-row-toggle')
    await expect
      .poll(() =>
        panel.evaluate(
          () => document.querySelector('.seo-field-detail')?.textContent,
        ),
      )
      .toContain('SEO 服务端标题')
    expect(
      await panel.evaluate(
        () => document.querySelector('.seo-field-detail')?.textContent,
      ),
    ).toContain('SEO 客户端标题')
    await panel.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .map(animation => animation.finished.catch(() => {})),
      )
    })
    const screenshot = await frontend.send<{ data: string }>(
      'Page.captureScreenshot',
      { format: 'png' },
    )
    await writeFile(
      testInfo.outputPath('seo-devtools.png'),
      Buffer.from(screenshot.data, 'base64'),
    )
    await clickText(panel, '问题', '.seo-tabs')
    await expect
      .poll(() =>
        panel.evaluate(() => document.querySelector('.seo-card')?.textContent),
      )
      .toContain('初始 HTML 的 noindex 在运行后被移除')
    // 通过浏览器的真实侧栏验证后台缓存共享，不直接调用缓存或替换消息 API。
    await panel.evaluate(async () => {
      const windowId = (await chrome.windows.getCurrent()).id!
      await chrome.sidePanel.open({ windowId })
    })
    let sideTarget = ''
    await expect
      .poll(async () => {
        sideTarget
          = (await cdp.send('Target.getTargets')).targetInfos.find(
            target =>
              target.url === `chrome-extension://${extensionId}/sidepanel.html`,
          )?.targetId ?? ''
        return sideTarget
      })
      .toBeTruthy()
    const sideSession = await cdp.send('Target.attachToTarget', {
      targetId: sideTarget,
      flatten: false,
    })
    const side = new SidePanel(cdp, sideSession.sessionId)
    await side.send('Runtime.enable')
    await side.send('Page.enable')
    await expect.poll(() => side.text()).toContain('未检测到 Nuxt 数据')
    await clickText(side, 'SEO', '.workspace-tabs')
    await expect
      .poll(() =>
        side.evaluate(() =>
          document
            .querySelector('[data-key="title"]')
            ?.getAttribute('data-change'),
        ),
      )
      .toBe('changed')
    expect(
      await side.evaluate(
        () => document.querySelector('.seo-source > summary')?.textContent,
      ),
    ).toContain('已关联本次文档响应')
    await website.evaluate(() => {
      history.pushState({}, '', '/seo-next')
      document.title = 'SEO 第二路由'
    })
    await expect
      .poll(() =>
        panel.evaluate(
          () => document.querySelector('.seo-source > summary')?.textContent,
        ),
      )
      .toContain('尚未捕获')
    await clickText(panel, '差异', '.seo-tabs')
    await expect
      .poll(() =>
        panel.evaluate(() =>
          document
            .querySelector('[data-key="title"]')
            ?.getAttribute('data-change'),
        ),
      )
      .toBe('unknown')
    expect(
      await panel.evaluate(
        () => document.querySelector('[data-key="title"]')?.textContent,
      ),
    ).toContain('SEO 第二路由')
    await expect
      .poll(() =>
        side.evaluate(() =>
          document
            .querySelector('[data-key="title"]')
            ?.getAttribute('data-change'),
        ),
      )
      .toBe('unknown')
    expect(side.exceptions).toEqual([])
    expect(panel.exceptions).toEqual([])
  }
  finally {
    await context.close()
  }
})
