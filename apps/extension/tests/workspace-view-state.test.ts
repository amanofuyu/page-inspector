import type { NetworkRecord } from '../features/network/session'
import type { NetworkViewInput } from '../features/network/useNetworkViewState'
import type { CollectedApp, CrawlResponse } from '../features/nuxt/types'
import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref, shallowReactive, shallowRef } from 'vue'
import { usePayloadViewState } from '../features/inspector/usePayloadViewState'
import { useSnapshotSelection } from '../features/inspector/useSnapshotSelection'
import { useNetworkViewState } from '../features/network/useNetworkViewState'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))
function application(id: string, value = 1): CollectedApp {
  return { id, label: id, declaredId: id, serverRendered: true, externalUrl: null, sources: [{ kind: 'inline', url: null, text: JSON.stringify([{ data: 1 }, { counter: 2 }, value]), bytes: 40, fetchedAt: 1 }] }
}
function snapshot(documentId = '文档一', apps = [application('a'), application('b')]): CrawlResponse {
  return { tabId: 1, documentId, requestId: '请求', status: 'ready', snapshot: { collectedAt: Date.now(), initialUrl: 'https://example.com/', pageUrl: 'https://example.com/', title: '页面', apps, warnings: [] } }
}
function setup() {
  const scope = effectScope()
  scopes.push(scope)
  const result = shallowRef<CrawlResponse | null>(null)
  const status = ref<'loading' | 'ready' | 'empty' | 'error'>('ready')
  const selected = scope.run(() => useSnapshotSelection(result, status))!
  const view = scope.run(() => usePayloadViewState(selected.application, selected.context, selected.resetRevision))!
  return { result, status, selected, view }
}

describe('数据区和网络区的派生视图', () => {
  it('同文档刷新保留应用身份、草稿和详情偏好，视图读取最新值', async () => {
    const state = setup()
    state.result.value = snapshot()
    await nextTick()
    state.selected.appIndex.value = 1
    await nextTick()
    state.view.query.value = 'counter'
    state.view.detailVisible.value = false
    state.view.splitSize.value = { horizontal: 72, vertical: 40 }
    state.result.value = snapshot('文档一', [application('a'), application('b', 2)])
    await nextTick()
    expect(state.selected.application.value?.id).toBe('b')
    expect(state.view.query.value).toBe('counter')
    expect(state.view.detailVisible.value).toBe(false)
    expect(state.view.splitSize.value).toEqual({ horizontal: 72, vertical: 40 })
    expect(state.view.tree.value?.root.children?.[0]?.value).toBe(2)
    state.status.value = 'error'
    expect(state.selected.status.value).toBe('ready')
  })

  it('独立响应和页面导航切换清理旧搜索，业务快照保持原样', async () => {
    const state = setup()
    state.result.value = snapshot()
    await nextTick()
    const page = state.result.value
    const app = application('response')
    state.selected.inspectResponse({ app, snapshot: { ...page.snapshot!, apps: [app], snapshotId: 'network:1', initialUrl: null } })
    await nextTick()
    state.view.query.value = 'old'
    expect(state.result.value).toBe(page)
    state.result.value = snapshot('文档二')
    await nextTick()
    expect(state.selected.responseOverride.value).toBeNull()
    expect(state.view.query.value).toBe('')
    expect(state.selected.application.value?.id).toBe('a')
  })

  it('网络修订更新关联等级；记录移除后清理选中 ID，筛选不修改会话', () => {
    const scope = effectScope()
    scopes.push(scope)
    const record: NetworkRecord = { id: 'r1', url: 'https://example.com/api', method: 'GET', status: 200, generation: 1, documentId: 'd1', startedAt: 1, durationMs: 1, resourceType: 'fetch', mime: 'application/json', contentSize: 10, bodySize: 10, pageRef: null, pageStartedAt: null, redirectUrl: null, cache: false, imported: false, ambiguous: false, metadataBytes: 10, bodyState: 'unread' }
    const session = { records: [record], body: () => undefined, observedAt: 1, preserve: false, metadataBytes: 10, bodyBytes: 0, dropped: 0 }
    const input = shallowReactive<NetworkViewInput>({ session, revision: 0 })
    const view = scope.run(() => useNetworkViewState(input))!
    view.choose(record.id)
    expect(view.selected.value?.association.level).toBe('无法关联')
    record.manualCandidate = true
    input.revision++
    expect(view.selected.value?.association.level).toBe('业务候选')
    view.filter.value = 'missing'
    expect(view.rows.value).toEqual([])
    expect(session.records).toHaveLength(1)
    session.records = []
    input.revision++
    expect(view.selectedId.value).toBe('')
    expect(view.selected.value).toBeUndefined()
  })
})
