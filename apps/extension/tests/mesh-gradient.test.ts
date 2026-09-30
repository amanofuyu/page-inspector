import { describe, expect, it } from 'vitest'
import { meshBufferSize, parseMeshColor } from '../features/inspector/mesh-gradient'

describe('网格背景的配色与像素预算', () => {
  it('读取深浅主题的十六进制底色和带透明度的色团', () => {
    expect(parseMeshColor('#121212')).toEqual([18 / 255, 18 / 255, 18 / 255, 1])
    expect(parseMeshColor('#fff')).toEqual([1, 1, 1, 1])
    // 生产 CSS 压缩会将 rgb 的透明度折叠成四位或八位十六进制。
    expect(parseMeshColor('#c21f3057')).toEqual([194 / 255, 31 / 255, 48 / 255, 87 / 255])
    expect(parseMeshColor('#fff8')).toEqual([1, 1, 1, 136 / 255])
    expect(parseMeshColor('rgb(194 31 48 / 34%)')).toEqual([194 / 255, 31 / 255, 48 / 255, 0.34])
    expect(parseMeshColor('rgba(255, 221, 0, 0.3)')).toEqual([1, 221 / 255, 0, 0.3])
    expect(() => parseMeshColor('')).toThrow('无法读取')
  })

  it('超宽屏和高分屏不突破绘制预算，缩放保持原有比例', () => {
    for (const [width, height, ratio] of [[320, 780, 3], [1920, 1080, 2], [7680, 2160, 2], [1280, 800, 0.8]]) {
      const [x, y] = meshBufferSize(width!, height!, ratio!)
      expect(x * y).toBeLessThanOrEqual(720000)
      expect(Math.max(x, y)).toBeLessThanOrEqual(1280)
      expect(x % 4).toBe(0)
      expect(y % 4).toBe(0)
      expect(Math.abs(x / y - width! / height!)).toBeLessThan(0.05)
    }
    expect(meshBufferSize(0, 0, 1)).toEqual([4, 4])
    expect(meshBufferSize(Number.NaN, 100, 1)).toEqual([4, 4])
  })
})
