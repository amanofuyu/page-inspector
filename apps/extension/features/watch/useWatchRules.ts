import type { FieldPath } from '../inspection/model'
import type { WorkbenchIndex, WorkbenchInput } from '../inspector/useWorkbenchIndex'
import type { QuerySpec } from '../query/engine'
import type { SavedQuery, WatchComparison, WatchRule } from './model'
import type { ToastInput } from '@/composables/useToast'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useDefinitions } from '@/composables/useDefinitions'
import { formatPath } from '../query/path'
import { matchesScope, scopeFor, WatchSession } from './model'

type WatchRulesIndex = Pick<WorkbenchIndex, 'ready' | 'call' | 'generation' | 'scope' | 'snapshotKey' | 'contextKey'>

export function useWatchRules(index: WatchRulesIndex, input: WorkbenchInput, notice: (notice: ToastInput) => void) {
  const { definitions, storageNotice, save, remove } = useDefinitions()
  const applicable = computed(() => definitions.value.filter(rule => matchesScope(rule.scope, index.scope.value)))
  const watches = computed(() => applicable.value.filter((rule): rule is WatchRule => rule.kind === 'watch'))
  const favorites = computed(() => applicable.value.filter((rule): rule is SavedQuery => rule.kind === 'query'))
  const otherWatches = computed(() => definitions.value.filter((rule): rule is WatchRule => rule.kind === 'watch' && !matchesScope(rule.scope, index.scope.value)))
  const watchedPaths = computed(() => new Set(watches.value.map(rule => formatPath(rule.path))))
  const context = computed(() => JSON.stringify(index.scope.value))
  const pending = ref(new Map<string, { context: string, path: string }>())
  const pendingWatchPaths = computed(() => new Set([...pending.value.values()].filter(item => item.context === context.value).map(item => item.path)))
  const comparisons = shallowRef<WatchComparison[]>([])
  const session = new WatchSession()
  let request = 0
  onScopeDispose(() => {
    request++
  })
  function reportError(failure: unknown) {
    notice({ message: failure instanceof Error ? failure.message : String(failure), kind: 'error' })
  }
  watch(index.generation, () => {
    request++
    comparisons.value = []
  }, { flush: 'sync' })
  async function updateWatches() {
    if (!index.ready.value || !input.app() || input.status() !== 'ready')
      return
    // 导航中的空快照只清理展示结果，不能清掉相邻成功快照的会话基线。
    session.reset(index.contextKey.value)
    const current = ++request
    const key = index.snapshotKey.value
    try {
      const values = await index.call('watches', JSON.parse(JSON.stringify(watches.value)))
      if (current === request)
        comparisons.value = session.update(key, values)
    }
    catch (failure) {
      if (current === request)
        reportError(failure)
    }
  }
  // 规则变化立即废弃旧比较响应，防止已删除的规则在回包后重新出现。
  watch(watches, () => {
    void updateWatches()
  }, { flush: 'sync' })
  async function changeWatch(path: FieldPath, options: { toggle?: boolean, name?: string, includeQuery: boolean }) {
    const selected = scopeFor(input.snapshot(), input.app(), options.includeQuery)
    if (!selected) {
      notice({ message: '需要可确认的初始文档和唯一应用声明标识；当前应用不能自动绑定关注。', kind: 'warning' })
      return false
    }
    const key = formatPath(path)
    const operation = `${context.value}:${key}`
    if (pending.value.has(operation))
      return false
    const existing = watches.value.filter(rule => formatPath(rule.path) === key)
    if (existing.length && !options.toggle) {
      notice({ message: '该路径已关注。', kind: 'info' })
      return false
    }
    pending.value.set(operation, { context: context.value, path: key })
    try {
      if (existing.length) {
        for (const rule of existing)
          await remove(rule.id)
        notice({ message: '已取消关注字段。', kind: 'success' })
      }
      else {
        await save({ version: 1, kind: 'watch', id: crypto.randomUUID(), name: options.name?.trim().slice(0, 160) || key.slice(0, 160), scope: selected, path: JSON.parse(JSON.stringify(path)), createdAt: Date.now() })
        notice({ message: '已关注字段；比较值仅保留在当前面板会话。', kind: 'success' })
      }
      return true
    }
    catch (failure) {
      reportError(failure)
      return false
    }
    finally {
      pending.value.delete(operation)
    }
  }
  async function saveQuery(query: QuerySpec, name: string, includeQuery: boolean) {
    const selected = scopeFor(input.snapshot(), input.app(), includeQuery)
    if (!selected) {
      notice({ message: '此应用没有可安全绑定的站点范围。', kind: 'warning' })
      return false
    }
    try {
      await save({ version: 1, kind: 'query', id: crypto.randomUUID(), name: name.trim().slice(0, 160) || '收藏查询', scope: selected, query: JSON.parse(JSON.stringify(query)), createdAt: Date.now() })
      return true
    }
    catch (failure) {
      reportError(failure)
      return false
    }
  }
  async function removeRule(id: string) {
    try {
      await remove(id)
    }
    catch (failure) { reportError(failure) }
  }
  async function rename(id: string, name: string) {
    const rule = watches.value.find(rule => rule.id === id)
    if (!rule)
      return
    try {
      await save({ ...rule, name: name.slice(0, 160) })
    }
    catch (failure) { reportError(failure) }
  }
  return { storageNotice, watches, favorites, otherWatches, watchedPaths, pendingWatchPaths, comparisons, updateWatches, changeWatch, saveQuery, removeRule, rename }
}
