import type { DataNode } from '../nuxt/format'
import type { ToastInput } from '@/composables/useToast'
import { useArtifactActions } from '@/composables/useArtifactActions'
import { copyNodeValue } from '../nuxt/copy'
import { exportNode } from '../nuxt/format'
import { formatPath } from '../query/path'

export type FieldCopyMode = 'value' | 'key' | 'typed' | 'path'

export function useFieldActions(notice: (notice: ToastInput) => void) {
  const artifacts = useArtifactActions(notice)
  async function copy(node: DataNode, mode: FieldCopyMode) {
    let text: string
    let message: string
    try {
      if (mode === 'value') {
        const result = copyNodeValue(node)
        text = result.text
        message = result.format === 'javascript' ? '已复制当前值（JavaScript 表达式）' : '已复制当前值'
      }
      else if (mode === 'key') {
        text = node.key
        message = '已复制当前属性名'
      }
      else if (mode === 'path') {
        text = node.fieldPath ? formatPath(node.fieldPath) : node.path
        message = '已复制字段路径'
      }
      else {
        text = exportNode(node)
        message = '已复制带类型的数据'
      }
    }
    catch (error) {
      notice({ message: error instanceof Error ? error.message : '当前值暂时无法复制，请使用带类型的数据复制。', kind: 'warning' })
      return
    }
    await artifacts.copy(text, message)
  }
  return { copy }
}
