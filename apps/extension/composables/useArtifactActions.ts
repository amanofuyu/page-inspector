import type { ToastInput } from './useToast'

/** 剪贴板和文件下载统一在动作层执行，视图只提交内容与意图。 */
export function useArtifactActions(notice: (notice: ToastInput) => void) {
  async function copy(value: unknown, message = '已复制') {
    try {
      await navigator.clipboard.writeText(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
      notice({ message, kind: 'success' })
    }
    catch {
      notice({ message: '复制失败，请使用导出。', kind: 'error' })
    }
  }
  function download(text: string, filename: string, type = 'application/json;charset=utf-8', message = '已发起下载') {
    try {
      const url = URL.createObjectURL(new Blob([text], { type }))
      try {
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        link.click()
        notice({ message, kind: 'success' })
      }
      finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    }
    catch {
      notice({ message: '导出失败，请重试。', kind: 'error' })
    }
  }
  function downloadJson(value: unknown, name: string) {
    download(JSON.stringify(value, null, 2), `${name}-${Date.now()}.json`)
  }
  return { copy, download, downloadJson }
}
