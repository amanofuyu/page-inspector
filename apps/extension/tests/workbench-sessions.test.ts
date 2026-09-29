import type { PayloadSession } from '../features/inspector/useWorkbenchIndex'
import type { QueryResult, QuerySpec } from '../features/query/engine'
import type { FieldDetail, IndexReady } from '../workers/protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, shallowRef } from 'vue'
import { useFieldDetails } from '../features/inspector/useFieldDetails'
import { useQuerySession } from '../features/query/useQuerySession'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
function setup() {
  const scope = effectScope()
  scopes.push(scope)
  const call = vi.fn<PayloadSession['call']>()
  const index: PayloadSession = { ready: shallowRef<IndexReady | null>({ coverage: { status: 'complete', scanned: 1, reasons: [], nodeBudget: 100, depthBudget: 10, timeBudgetMs: 1000 }, metrics: [], fieldSources: {}, parsedComplete: true }), pending: ref(0), generation: ref(1), call }
  const notice = vi.fn()
  return { scope, index, call, notice, query: scope.run(() => useQuerySession(index))!, detail: scope.run(() => useFieldDetails(index, notice))! }
}
const spec = (): QuerySpec => ({ combine: 'all', category: 'data', conditions: [{ field: 'path', op: 'eq', value: '*' }] })
const result = (offset = 0): QueryResult => ({ matches: [], total: 100, limited: false, coverage: { status: 'complete', scanned: 100, reasons: [], nodeBudget: 100, depthBudget: 10, timeBudgetMs: 1000 }, offset })

describe('工作区业务结果与组件选择边界', () => {
  it('面板卸载后丢弃在途查询和详情', async () => {
    const state = setup()
    const query = deferred<QueryResult>()
    const detail = deferred<FieldDetail>()
    state.call.mockReturnValueOnce(query.promise).mockReturnValueOnce(detail.promise)
    const tasks = [state.query.query(spec()), state.detail.locate([], 'query-0')]
    state.scope.stop()
    query.resolve(result())
    detail.resolve({ tree: null, path: [], known: true, sourceIds: [] })
    await Promise.all(tasks)
    expect(state.query.results.value).toBeNull()
    expect(state.detail.detail.value).toBeNull()
    expect(state.detail.detailLocation.value).toBeNull()
  })

  it('草稿编辑和翻页都不改变已提交条件，导出依据执行时的条件', async () => {
    const state = setup()
    const reply = deferred<QueryResult>()
    state.call.mockReturnValueOnce(reply.promise)
    const draft = spec()
    const task = state.query.query(draft)
    draft.conditions[0]!.value = 'changed'
    reply.resolve(result())
    await task
    expect(state.query.executedSpec.value?.conditions[0]?.value).toBe('*')
    expect(state.call.mock.calls[0]?.[1]).toMatchObject({ conditions: [{ value: '*' }] })
    state.call.mockResolvedValueOnce(result(50))
    await state.query.query(draft, 50)
    expect(state.call).toHaveBeenLastCalledWith('page', 50)
    expect(state.query.executedSpec.value?.conditions[0]?.value).toBe('*')
  })

  it('切换快照使旧查询成功和失败回包同时失效', async () => {
    const state = setup()
    const first = deferred<QueryResult>()
    const second = deferred<QueryResult>()
    state.call.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const firstTask = state.query.query(spec())
    const secondTask = state.query.query(spec())
    state.index.generation.value++
    first.resolve(result())
    second.reject(new Error('旧快照错误'))
    await Promise.all([firstTask, secondTask])
    expect(state.query.results.value).toBeNull()
    expect(state.query.executedSpec.value).toBeNull()
    expect(state.query.queryError.value).toBe('')
  })

  it('新查询失败不显示上次结果，忙碌时不重复提交', async () => {
    const state = setup()
    state.call.mockResolvedValueOnce(result())
    await state.query.query(spec())
    state.call.mockRejectedValueOnce(new Error('请输入明确的数字'))
    await state.query.query(spec())
    expect(state.query.results.value).toBeNull()
    expect(state.query.queryError.value).toBe('请输入明确的数字')
    state.index.pending.value = 1
    await state.query.query(spec())
    expect(state.call).toHaveBeenCalledTimes(2)
  })

  it('快速切换条目只接受最后一次详情，关闭后回包不能重新展开', async () => {
    const state = setup()
    const first = deferred<FieldDetail>()
    const second = deferred<FieldDetail>()
    state.call.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const a = state.detail.locate([], 'ranking-a')
    const b = state.detail.locate([], 'ranking-b')
    first.resolve({ tree: null, path: [], known: false, sourceIds: ['old'] })
    await a
    expect(state.detail.detail.value).toBeNull()
    expect(state.detail.detailLoading.value).toBe(true)
    expect(state.detail.detailLocation.value).toBe('ranking-b')
    state.detail.closeDetail()
    second.resolve({ tree: null, path: [], known: true, sourceIds: ['new'] })
    await b
    expect(state.detail.detail.value).toBeNull()
    expect(state.detail.detailLocation.value).toBeNull()
    expect(state.detail.detailLoading.value).toBe(false)
  })
})
