// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { animateUi } from '../libs/motion'

const { animate, controls } = vi.hoisted(() => {
  const controls: { cancel: ReturnType<typeof vi.fn>, complete: () => void }[] = []
  const animate = vi.fn(() => {
    const control = { cancel: vi.fn(), complete: () => {} }
    controls.push(control)
    return {
      cancel: control.cancel,
      then(callback: () => void) {
        control.complete = callback
      },
    }
  })
  return { animate, controls }
})
vi.mock('motion-v', () => ({ animateMini: animate }))

function createElement() {
  return Object.assign(document.createElement('div'), { animate: vi.fn() })
}

let preference: MediaQueryList
beforeEach(() => {
  controls.length = 0
  preference = Object.assign(new EventTarget(), { matches: false }) as MediaQueryList
  vi.spyOn(window, 'matchMedia').mockReturnValue(preference)
})
afterEach(() => vi.restoreAllMocks())

describe('临时动效的取消与样式恢复', () => {
  it('结束时恢复内联样式及优先级，保留动画之外的实时修改', () => {
    const element = createElement()
    element.style.setProperty('height', 'auto', 'important')
    element.style.overflow = 'auto'
    const onComplete = vi.fn()
    animateUi(element, { height: ['0px', '180px'], opacity: [0, 1] }, { styles: { overflow: 'clip' }, onComplete })
    element.style.height = '180px'
    element.style.opacity = '1'
    element.style.color = 'red'
    controls[0]!.complete()
    expect(element.style.height).toBe('auto')
    expect(element.style.getPropertyPriority('height')).toBe('important')
    expect(element.style.overflow).toBe('auto')
    expect(element.style.opacity).toBe('')
    expect(element.style.color).toBe('red')
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('快速切换时旧动画的延迟回调不会清理新动画或执行旧离场', () => {
    const element = createElement()
    const oldComplete = vi.fn()
    const previous = animateUi(element, { opacity: [1, 0] }, { onComplete: oldComplete })
    previous.cancel()
    const current = animateUi(element, { opacity: [0, 1] })
    element.style.opacity = '0.5'
    controls[0]!.complete()
    expect(element.style.opacity).toBe('0.5')
    expect(oldComplete).not.toHaveBeenCalled()
    current.cancel()
    expect(element.style.opacity).toBe('')
  })

  it('动态开启减少动态效果会完成离场并释放监听，不留下固定高度', () => {
    const element = createElement()
    const onComplete = vi.fn()
    const remove = vi.spyOn(preference, 'removeEventListener')
    const animation = animateUi(element, { height: ['100px', '0px'] }, { onComplete })
    element.style.height = '42px'
    Object.assign(preference, { matches: true })
    preference.dispatchEvent(new Event('change'))
    controls[0]!.complete()
    animation.finish()
    expect(element.style.height).toBe('')
    expect(controls[0]!.cancel).toHaveBeenCalledOnce()
    expect(onComplete).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('减少动态效果下直接完成，不启动 Motion 或覆盖布局', () => {
    Object.assign(preference, { matches: true })
    const element = createElement()
    const onComplete = vi.fn()
    const animation = animateUi(element, { height: ['0px', '180px'] }, { styles: { overflow: 'clip' }, onComplete })
    animation.cancel()
    animation.finish()
    expect(animate).not.toHaveBeenCalled()
    expect(element.style.cssText).toBe('')
    expect(onComplete).toHaveBeenCalledOnce()
  })
})
