// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InspectorAmbience from '../features/inspector/components/InspectorAmbience.vue'

const { create, renderer } = vi.hoisted(() => {
  const renderer = { resize: vi.fn(), setPalette: vi.fn(), draw: vi.fn(() => true), dispose: vi.fn() }
  return { renderer, create: vi.fn(() => renderer as typeof renderer | null) }
})
vi.mock('../features/inspector/mesh-gradient', () => ({ createMeshGradientRenderer: create }))

let motion: MediaQueryList
let transparency: MediaQueryList
let wrapper: ReturnType<typeof mount> | undefined
let hidden = false
const frames = new Map<number, FrameRequestCallback>()
let sequence = 0

beforeEach(() => {
  vi.clearAllMocks()
  create.mockReturnValue(renderer)
  renderer.draw.mockReturnValue(true)
  hidden = false
  frames.clear()
  motion = Object.assign(new EventTarget(), { matches: false }) as MediaQueryList
  transparency = Object.assign(new EventTarget(), { matches: false }) as MediaQueryList
  vi.spyOn(window, 'matchMedia').mockImplementation(query => query.includes('transparency') ? transparency : motion)
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++sequence, callback)
    return sequence
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function render() {
  wrapper = mount(InspectorAmbience)
  await flushPromises()
  return wrapper
}

describe('网格背景生命周期', () => {
  it('页面隐藏时停止绘制，恢复后继续；卸载释放资源和动画', async () => {
    const view = await render()
    expect(view.attributes('data-renderer')).toBe('webgl')
    expect(frames.size).toBe(1)
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(frames.size).toBe(0)
    expect(view.attributes('data-motion')).toBe('paused')
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(frames.size).toBe(1)
    expect(view.attributes('data-motion')).toBe('running')
    view.unmount()
    wrapper = undefined
    expect(frames.size).toBe(0)
    expect(renderer.dispose).toHaveBeenCalledOnce()
  })

  it('减少动态效果只绘制静态帧，偏好切换可以恢复和暂停', async () => {
    Object.assign(motion, { matches: true })
    await render()
    expect(renderer.draw).toHaveBeenCalled()
    expect(frames.size).toBe(0)
    Object.assign(motion, { matches: false })
    motion.dispatchEvent(new Event('change'))
    expect(frames.size).toBe(1)
    Object.assign(motion, { matches: true })
    motion.dispatchEvent(new Event('change'))
    expect(frames.size).toBe(0)
  })

  it('减少透明度时不创建上下文，恢复偏好后再初始化', async () => {
    Object.assign(transparency, { matches: true })
    await render()
    expect(create).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
    Object.assign(transparency, { matches: false })
    transparency.dispatchEvent(new Event('change'))
    expect(create).toHaveBeenCalledOnce()
    expect(frames.size).toBe(1)
  })

  it('图形上下文不可用时保留 CSS 背景，不重复创建或启动绘制循环', async () => {
    create.mockReturnValue(null)
    const view = await render()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(view.attributes('data-renderer')).toBe('css')
    expect(view.findAll('.ambient-glow')).toHaveLength(3)
    expect(create).toHaveBeenCalledOnce()
    expect(frames.size).toBe(0)
  })

  it('上下文丢失后释放失效资源，恢复事件重新建立渲染器', async () => {
    const view = await render()
    const surface = view.get('canvas').element
    const lost = new Event('webglcontextlost', { cancelable: true })
    surface.dispatchEvent(lost)
    await flushPromises()
    expect(lost.defaultPrevented).toBe(true)
    expect(view.attributes('data-renderer')).toBe('css')
    expect(frames.size).toBe(0)
    expect(renderer.dispose).toHaveBeenCalledOnce()
    surface.dispatchEvent(new Event('webglcontextrestored'))
    await flushPromises()
    expect(create).toHaveBeenCalledTimes(2)
    expect(view.attributes('data-renderer')).toBe('webgl')
  })
})
