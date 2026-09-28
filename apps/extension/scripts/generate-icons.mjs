import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

// PNG 与界面共用同一份 SVG，修改原稿后运行此脚本同步各尺寸。
const source = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8')
const output = new URL('../public/icon/', import.meta.url)
const sizes = [16, 32, 48, 128]
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chromium', headless: true })
try {
  const page = await browser.newPage()
  for (const size of sizes) {
    const png = await page.evaluate(async ({ source, size }) => {
      const icon = new Image()
      icon.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
      await icon.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const context = canvas.getContext('2d')
      if (!context)
        throw new Error('无法创建图标渲染画布。')
      context.drawImage(icon, 0, 0, size, size)
      return canvas.toDataURL('image/png').split(',')[1]
    }, { source, size })
    await writeFile(new URL(`${size}.png`, output), Buffer.from(png, 'base64'))
  }
  console.log(`已从 SVG 生成图标：${sizes.join('、')} 像素。`)
}
finally {
  await browser.close()
}
