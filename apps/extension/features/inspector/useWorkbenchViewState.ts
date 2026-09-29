import type { QuerySpec } from '../query/engine'
import { ref } from 'vue'

export interface WatchDraft {
  path: string
  name: string
  includeQuery: boolean
}

/** 草稿在工作区切换时保留；提交成功只清空仍属于该次提交的名称。 */
export function useWorkbenchViewState() {
  const spec = ref<QuerySpec>({ combine: 'all', category: 'data', conditions: [{ field: 'path', op: 'eq', value: '*' }] })
  const queryName = ref('')
  const watchDraft = ref<WatchDraft>({ path: '', name: '', includeQuery: false })
  const rankingSort = ref<'size' | 'path' | 'items'>('size')
  return { spec, queryName, watchDraft, rankingSort }
}
