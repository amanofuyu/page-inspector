// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import UiJsonCode from '../components/ui/UiJsonCode.vue'
import * as shiki from '../composables/useShiki'

const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  vi.restoreAllMocks()
})
function render(code: string) {
  const wrapper = mount(UiJsonCode, { props: { code, label: 'JSON-LD 内容' } })
  wrappers.push(wrapper)
  return wrapper
}

describe('代码高亮与原文保留', () => {
  it('明暗配色覆盖不同标记，保留精度、重复键和转义，并安全展示 HTML 字符串', async () => {
    const code = '{\n  "name": "一",\n  "name": "二",\n  "large": 9007199254740993,\n  "enabled": true,\n  "html": "<img src=x onerror=alert(1)>",\n  "escaped": "a\\n\\\"b"\n}'
    const wrapper = render(code)
    await vi.waitFor(() => expect(wrapper.find('.shiki').exists()).toBe(true), { timeout: 10000 })
    expect(wrapper.get('code').text()).toBe(code)
    expect(wrapper.findAll('img, script')).toHaveLength(0)
    expect(wrapper.findAll('.line')).toHaveLength(code.split('\n').length)
    const styles = wrapper.findAll('.line > span[style]').map(token => token.attributes('style') ?? '')
    expect(new Set(styles).size).toBeGreaterThanOrEqual(3)
    expect(styles.every(style => style.includes('--shiki-dark:'))).toBe(true)
    expect(wrapper.get('[role="region"]').attributes('tabindex')).toBe('0')
    await wrapper.setProps({ compact: true })
    expect(wrapper.get('[role="region"]').attributes('tabindex')).toBeUndefined()
  })

  it('高亮加载失败仍显示原文和回退提示', async () => {
    const api = shiki.useShiki()
    vi.spyOn(shiki, 'useShiki').mockReturnValue({ ...api, initHighlighter: vi.fn().mockRejectedValue(new Error('高亮加载失败')) })
    const code = '{"broken":'
    const wrapper = render(code)
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(true))
    expect(wrapper.get('pre').text()).toBe(code)
    expect(wrapper.find('.shiki').exists()).toBe(false)
  })

  it('内容切换或卸载后丢弃迟到的高亮结果', async () => {
    const api = shiki.useShiki()
    const highlighter = await api.initHighlighter()
    let finish!: (value: typeof highlighter) => void
    const pending = new Promise<typeof highlighter>((resolve) => {
      finish = resolve
    })
    const codeToHtml = vi.spyOn(highlighter, 'codeToHtml')
    vi.spyOn(shiki, 'useShiki').mockReturnValue({ ...api, initHighlighter: () => pending })
    const wrapper = render('{"old":true}')
    await wrapper.setProps({ code: '{"current":true}' })
    const removed = render('{"removed":true}')
    removed.unmount()
    wrappers.pop()
    finish(highlighter)
    await vi.waitFor(() => expect(wrapper.find('.shiki').exists()).toBe(true))
    expect(wrapper.get('code').text()).toBe('{"current":true}')
    expect(codeToHtml).toHaveBeenCalledTimes(1)
  })
})
