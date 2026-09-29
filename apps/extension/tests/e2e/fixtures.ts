import type { BrowserContext, CDPSession, Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { test as base, chromium, expect } from '@playwright/test'

export class SidePanel {
  private sequence = 0
  private pending = new Map<number, {
    resolve: (result: any) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()

  readonly exceptions: string[] = []
  constructor(private connection: CDPSession, private sessionId: string) {
    connection.on('Target.receivedMessageFromTarget', (event) => {
      if (event.sessionId !== sessionId)
        return
      const message = JSON.parse(event.message)
      if (message.method === 'Runtime.exceptionThrown')
        this.exceptions.push(JSON.stringify(message.params.exceptionDetails))
      const request = this.pending.get(message.id)
      if (!request)
        return
      clearTimeout(request.timer)
      this.pending.delete(message.id)
      if (message.error)
        request.reject(new Error(message.error.message))
      else
        request.resolve(message.result)
    })
  }

  send<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`侧边栏命令超时：${method}`))
      }, 10000)
      this.pending.set(id, { resolve, reject, timer })
      void this.connection.send('Target.sendMessageToTarget', { sessionId: this.sessionId, message: JSON.stringify({ id, method, params }) }).catch(reject)
    })
  }

  async evaluate<T, A = undefined>(fn: (arg: A) => T | Promise<T>, arg?: A): Promise<T> {
    const result = await this.send('Runtime.evaluate', {
      expression: `(${fn.toString()})(${JSON.stringify(arg) ?? 'undefined'})`,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    })
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }

  text() {
    return this.evaluate(() => document.body?.textContent ?? '')
  }

  async click(selector: string) {
    // 等待位置稳定且中心可点击，避免点击移动中的元素或浮层遮挡区域。
    let previous = ''
    let stable = 0
    await expect.poll(async () => {
      const geometry = await this.evaluate((query) => {
        const element = document.querySelector<HTMLElement>(query)
        if (!element)
          return ''
        element.scrollIntoView({ block: 'center' })
        const rect = element.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        if (!rect.width || !rect.height || !hit || !element.contains(hit))
          return ''
        return JSON.stringify([rect.x, rect.y, rect.width, rect.height, window.innerWidth])
      }, selector)
      stable = geometry && geometry === previous ? stable + 1 : 0
      previous = geometry
      return stable
    }, { intervals: [80], timeout: 8000 }).toBeGreaterThanOrEqual(2)
    const point = await this.evaluate((query) => {
      const element = document.querySelector<HTMLElement>(query)
      if (!element)
        throw new Error(`找不到元素：${query}`)
      element.scrollIntoView({ block: 'center' })
      const rect = element.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    }, selector)
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
  }

  async select(selector: string, value: string) {
    await this.click(selector)
    let optionSelector = ''
    await expect.poll(async () => {
      optionSelector = await this.evaluate(({ query, next }) => {
        const trigger = document.querySelector(query)
        const content = document.getElementById(trigger?.getAttribute('aria-controls') ?? '')
        const option = Array.from(content?.querySelectorAll<HTMLElement>('[role="option"]') ?? []).find(item => item.dataset.optionValue === next)
        return option ? `#${CSS.escape(option.id)}` : ''
      }, { query: selector, next: value })
      return optionSelector
    }).not.toBe('')
    await this.click(optionSelector)
  }

  async search(text: string) {
    await this.click('input[type="search"]')
    await this.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('input[type="search"]')!
      input.value = ''
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await this.send('Input.insertText', { text })
  }
}
export interface InspectorOptions {
  targetUrl: string
  expectedText: string
}
export const test = base.extend<InspectorOptions & {
  extension: {
    context: BrowserContext
    website: Page
    panel: SidePanel
    downloads: string
  }
}>({
  targetUrl: ['http://127.0.0.1:4318/inline', { option: true }],
  expectedText: ['ShallowReactive', { option: true }],
  extension: async ({ targetUrl, expectedText }, use, testInfo) => {
    const extensionPath = path.resolve('.output/chrome-mv3-prod')
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1280, height: 900 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    })
    try {
      const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
      const website = await context.newPage()
      await website.goto(targetUrl)
      const launcher = await context.newPage()
      await launcher.goto(worker.url().replace('background.js', 'sidepanel.html'))
      const windowId = await worker.evaluate(async () => (await chrome.windows.getCurrent()).id!)
      await launcher.evaluate((id) => {
        const button = document.createElement('button')
        button.id = 'launch-test'
        button.textContent = '打开测试侧边栏'
        // 产品外层禁止滚动，测试入口固定在视口内，不依赖滚动到应用末尾。
        button.style.cssText = 'position:fixed;top:12px;left:12px;z-index:1000'
        button.onclick = () => chrome.sidePanel.open({ windowId: id })
        document.body.append(button)
      }, windowId)
      await launcher.locator('#launch-test').click()
      await website.bringToFront()
      // Chromium 的真实侧边栏未被 Playwright 映射成 Page，使用 CDP 连接同一个真实目标。
      const cdp = await context.newCDPSession(launcher)
      const launcherId = (await cdp.send('Target.getTargetInfo')).targetInfo.targetId
      let targetId: string | undefined
      await expect.poll(async () => {
        const targets = (await cdp.send('Target.getTargets')).targetInfos
        targetId = targets.find(target => target.url.includes('sidepanel.html') && target.targetId !== launcherId)?.targetId
        return targetId
      }).toBeTruthy()
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: targetId!, flatten: false })
      const panel = new SidePanel(cdp, sessionId)
      await panel.send('Runtime.enable')
      await panel.send('Page.enable')
      const downloads = testInfo.outputPath('downloads')
      await mkdir(downloads, { recursive: true })
      await panel.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads })
      await expect.poll(() => panel.text()).toContain(expectedText)
      await context.grantPermissions(['clipboard-read'], { origin: new URL(targetUrl).origin })
      await use({ context, website, panel, downloads })
      expect(panel.exceptions).toEqual([])
    }
    finally {
      await context.close()
    }
  },
})
export { expect } from '@playwright/test'
/** 使用真实输入事件设置条件，供侧栏与 DevTools 共用验收。 */
export async function fillField(panel: SidePanel, selector: string, value: string) {
  await panel.evaluate(({ selector, value }) => {
    const input = document.querySelector<HTMLInputElement>(selector)
    if (!input)
      throw new Error(`找不到输入框：${selector}`)
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, { selector, value })
}
export async function clickText(panel: SidePanel, label: string, scope = '') {
  const selector = await panel.evaluate(({ label, scope }) => {
    const root = scope ? document.querySelector(scope)! : document
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === label && button.getBoundingClientRect().height > 0)
    if (!button)
      throw new Error(`找不到按钮：${label}`)
    button.dataset.testAction = 'current'
    return '[data-test-action="current"]'
  }, { label, scope })
  await panel.click(selector)
  await panel.evaluate(() => {
    for (const element of document.querySelectorAll('[data-test-action]'))
      element.removeAttribute('data-test-action')
  })
}
