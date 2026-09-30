import type { SidePanel } from './fixtures'
import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { expect, test } from './fixtures'

// 在实际绘制后立即读回颜色，避免浏览器清理未保留的绘图缓冲区造成假阳性。
async function sample(panel: SidePanel) {
  return panel.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('.ambient-mesh')!
    const gl = canvas.getContext('webgl2')!
    const draw = gl.drawArrays.bind(gl)
    return new Promise<{ colors: number[][], time: number, error: number }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        gl.drawArrays = draw
        reject(new Error('网格渐变没有产生绘制帧'))
      }, 5000)
      gl.drawArrays = (...args) => {
        draw(...args)
        const colors: number[][] = []
        for (const y of [0.08, 0.3, 0.5, 0.7, 0.92]) {
          for (const x of [0.08, 0.3, 0.5, 0.7, 0.92]) {
            const pixel = new Uint8Array(4)
            gl.readPixels(Math.floor(x * canvas.width), Math.floor((1 - y) * canvas.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
            colors.push([...pixel])
          }
        }
        const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram
        const time = gl.getUniform(program, gl.getUniformLocation(program, 'u_time')!) as number
        gl.drawArrays = draw
        clearTimeout(timeout)
        resolve({ colors, time, error: gl.getError() })
      }
      document.documentElement.classList.toggle('mesh-frame-probe')
    })
  })
}

test('宽幅红色光带呈现浓淡流动，支持主题与窄屏', async ({ extension }, testInfo) => {
  const { panel } = extension
  await expect.poll(() => panel.evaluate(() => document.querySelector<HTMLElement>('.inspector-ambience')?.dataset.renderer)).toBe('webgl')
  for (const theme of ['light', 'dark']) {
    await panel.select('[aria-label="界面主题"]', theme)
    await panel.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 780, deviceScaleFactor: 1, mobile: false })
    await panel.evaluate(async () => {
      await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})))
    })
    const result = await sample(panel)
    expect(result.error).toBe(0)
    // 红色覆盖多数采样点，同时保留明显的浓淡差异，避免退化成细线或纯色遮罩。
    const redness = result.colors.map(color => color[0]! - Math.max(color[1]!, color[2]!))
    expect(redness.filter(value => value > 12).length).toBeGreaterThanOrEqual(15)
    expect(redness.every(value => value >= 0)).toBe(true)
    expect(Math.max(...redness) - Math.min(...redness)).toBeGreaterThan(24)
    expect(result.colors.every(color => color[3] === 255)).toBe(true)
    const screenshot = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
    await writeFile(testInfo.outputPath(`mesh-${theme}-wide.png`), Buffer.from(screenshot.data, 'base64'))
  }
  const before = await sample(panel)
  await expect.poll(async () => (await sample(panel)).time).toBeGreaterThan(before.time + 2)
  const after = await sample(panel)
  expect(after.colors.filter((color, index) => color.some((channel, channelIndex) => Math.abs(channel - before.colors[index]![channelIndex]!) > 4)).length).toBeGreaterThan(8)
  await panel.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 780, deviceScaleFactor: 2, mobile: false })
  await expect.poll(() => panel.evaluate(() => document.querySelector<HTMLCanvasElement>('.ambient-mesh')?.width)).toBe(320)
  expect(await panel.evaluate(() => {
    const card = document.querySelector('.inspector-shell')!.getBoundingClientRect()
    const background = document.querySelector('.inspector-ambience')!.getBoundingClientRect()
    return document.documentElement.scrollWidth <= innerWidth && background.width === innerWidth && background.height === innerHeight
      && card.x === 8 && card.y === 8 && card.right === innerWidth - 8 && card.bottom === innerHeight - 8
  })).toBe(true)
  const screenshot = await panel.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
  await writeFile(testInfo.outputPath('mesh-dark-narrow.png'), Buffer.from(screenshot.data, 'base64'))
})

test('系统偏好与上下文丢失都有可用降级，恢复后继续绘制', async ({ extension }) => {
  const { panel } = extension
  await expect.poll(() => panel.evaluate(() => document.querySelector<HTMLElement>('.inspector-ambience')?.dataset.renderer)).toBe('webgl')
  await panel.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await expect.poll(() => panel.evaluate(() => document.querySelector<HTMLElement>('.inspector-ambience')?.dataset.motion)).toBe('paused')
  const before = await sample(panel)
  await panel.evaluate(() => new Promise(resolve => setTimeout(resolve, 160)))
  expect(await sample(panel)).toEqual(before)
  await panel.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] })
  await expect.poll(() => panel.evaluate(() => getComputedStyle(document.querySelector('.inspector-ambience')!).display)).toBe('none')
  await panel.send('Emulation.setEmulatedMedia', { features: [] })
  await expect.poll(() => panel.evaluate(() => document.querySelector<HTMLElement>('.inspector-ambience')?.dataset.motion)).toBe('running')

  await panel.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.ambient-mesh')!
    const loss = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!
    Object.assign(canvas, { meshContextLoss: loss })
    loss.loseContext()
  })
  await expect.poll(() => panel.evaluate(() => document.querySelector<HTMLElement>('.inspector-ambience')?.dataset.renderer)).toBe('css')
  expect(await panel.evaluate(() => getComputedStyle(document.querySelector('.ambient-fallback')!).display)).not.toBe('none')
  await panel.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement & { meshContextLoss: WEBGL_lose_context }>('.ambient-mesh')!
    canvas.meshContextLoss.restoreContext()
  })
  await expect.poll(() => panel.evaluate(() => document.querySelector<HTMLElement>('.inspector-ambience')?.dataset.renderer)).toBe('webgl')
  expect((await sample(panel)).error).toBe(0)
})

test('启动时禁用 WebGL 仍可显示背景并操作数据树', async ({ extension }) => {
  const { panel } = extension
  await panel.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return type === 'webgl2' ? null : getContext.call(this, type, ...args);
    };
  ` })
  await panel.send('Page.reload')
  await expect.poll(() => panel.evaluate(() => document.querySelector<HTMLElement>('.inspector-ambience')?.dataset.renderer)).toBe('css')
  await expect.poll(() => panel.text()).toContain('ShallowReactive')
  await panel.click('.data-tree-pane [aria-label="展开 sample"]')
  await expect.poll(() => panel.text()).toContain('Nuxt 3.17.5')
})
