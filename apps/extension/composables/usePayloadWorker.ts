import type { CollectedApp } from '@/features/nuxt/types'
import type { Operation, WorkerOperations } from '@/workers/protocol'
import { onBeforeUnmount, ref, shallowRef } from 'vue'

export function usePayloadWorker() {
  const ready = shallowRef<WorkerOperations['init']['output'] | null>(null)
  const pending = ref(0)
  const error = ref('')
  let worker: Worker | null = null
  let snapshot = ''
  let sequence = 0
  const tasks = new Map<number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  function stop(reason = '任务已取消，重新建立索引后可继续。') {
    worker?.terminate()
    worker = null
    ready.value = null
    for (const task of tasks.values()) {
      clearTimeout(task.timer)
      task.reject(new Error(reason))
    }
    tasks.clear()
    pending.value = 0
    error.value = reason
  }
  function call<K extends Operation>(operation: K, input: WorkerOperations[K]['input']): Promise<WorkerOperations[K]['output']> {
    if (!worker)
      return Promise.reject(new Error('索引尚未建立。'))
    const id = ++sequence
    pending.value++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(stop, 8000, '任务超过 8 秒总预算，已终止 Worker。')
      tasks.set(id, { resolve: value => resolve(value as WorkerOperations[K]['output']), reject, timer })
      worker!.postMessage({ id, snapshot, operation, input })
    })
  }
  async function initialize(app: CollectedApp, key: string, source: number | null) {
    stop('快照已切换。')
    error.value = ''
    snapshot = key
    const current = new Worker(new URL('../workers/payload.worker.ts', import.meta.url), { type: 'module' })
    worker = current
    current.onmessage = (event) => {
      if (worker !== current || event.data.snapshot !== snapshot)
        return
      const task = tasks.get(event.data.id)
      if (!task)
        return
      clearTimeout(task.timer)
      tasks.delete(event.data.id)
      pending.value--
      if (event.data.error)
        task.reject(new Error(event.data.error))
      else
        task.resolve(event.data.output)
    }
    current.onerror = () => {
      if (worker === current)
        stop('分析 Worker 运行失败，请重试。')
    }
    try {
      const result = await call('init', { app, source })
      if (worker === current)
        ready.value = result
    }
    catch (failure) {
      if (worker === current)
        error.value = failure instanceof Error ? failure.message : String(failure)
    }
  }
  onBeforeUnmount(() => stop('面板已关闭。'))
  return { ready, pending, error, initialize, call, stop }
}
