import type { DataNode } from '../features/nuxt/format'
import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, ref, shallowRef } from 'vue'
import { useDataSelection } from '../features/inspector/useDataSelection'
import { buildTree } from '../features/nuxt/format'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))
function setup(value: unknown) {
  const root = shallowRef<DataNode | undefined>(buildTree(value).root)
  const context = ref('页面一:应用一:data')
  const scope = effectScope()
  scopes.push(scope)
  const selection = scope.run(() => useDataSelection(root, context))!
  return { root, context, ...selection }
}

describe('数据树与详情的选择同步', () => {
  it('同一文档刷新保留路径，同时使用新快照中的值', () => {
    const state = setup({ counter: 1 })
    const previous = state.root.value!.children![0]!
    state.select(previous)
    state.root.value = buildTree({ counter: 2 }).root
    expect(state.selected.value?.path).toBe(previous.path)
    expect(state.selected.value?.value).toBe(2)
    expect(state.selected.value).not.toBe(previous)
  })

  it('字段消失后回到根节点，稍后出现同名字段也不恢复旧选择', () => {
    const state = setup({ removed: true })
    state.select(state.root.value!.children![0]!)
    state.root.value = buildTree({ remaining: true }).root
    expect(state.selected.value).toBe(state.root.value)
    state.root.value = buildTree({ removed: false }).root
    expect(state.selected.value).toBe(state.root.value)
  })

  it('页面、应用或分类切换清除旧路径，收起详情的偏好继续保留', () => {
    const state = setup({ shared: '旧值' })
    state.select(state.root.value!.children![0]!)
    state.visible.value = false
    state.context.value = '页面二:应用二:state'
    state.root.value = buildTree({ shared: '新值' }).root
    expect(state.selected.value).toBe(state.root.value)
    expect(state.visible.value).toBe(false)
    state.select(state.root.value.children![0]!)
    expect(state.visible.value).toBe(true)
    expect(state.selected.value?.value).toBe('新值')
  })

  it('空快照立即清除详情，并忽略已离场节点的点击', () => {
    const state = setup({ previous: true })
    const previous = state.root.value!.children![0]!
    state.select(previous)
    state.root.value = undefined
    expect(state.selected.value).toBeUndefined()
    state.root.value = buildTree({ current: true }).root
    state.select(previous)
    expect(state.selected.value).toBe(state.root.value)
  })

  it('特殊集合与引用使用节点路径区分，不按显示字段名混淆', () => {
    const shared = { value: 1 }
    const state = setup({ map: new Map([['value', shared]]), shared })
    const reference = state.root.value!.children![1]!
    state.select(reference)
    expect(state.selected.value?.type).toBe('Reference')
    expect(state.selected.value?.path).toBe('$["shared"]')
  })
})
