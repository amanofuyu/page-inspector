import type { SeoHtmlInput, SeoSnapshot } from './model'

/** 每次解析单独隔离，取消或超时直接终止，不阻塞侧栏。 */
export function parseHtmlWorker(
  input: SeoHtmlInput,
  signal: AbortSignal,
): Promise<SeoSnapshot> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('采集已取消。'))
      return
    }
    const worker = new Worker(
      new URL('../../workers/seo.worker.ts', import.meta.url),
      { type: 'module' },
    )
    const timer = setTimeout(
      () => finish(new Error('HTML 解析超过 8 秒，已停止。')),
      8000,
    )
    const abort = () => finish(new Error('采集已取消。'))
    function finish(error?: Error, snapshot?: SeoSnapshot) {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      worker.terminate()
      if (error)
        reject(error)
      else resolve(snapshot!)
    }
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = event =>
      finish(
        event.data.error ? new Error(event.data.error) : undefined,
        event.data.snapshot,
      )
    worker.onerror = () => finish(new Error('HTML 解析失败，请重试。'))
    worker.postMessage(input)
  })
}
