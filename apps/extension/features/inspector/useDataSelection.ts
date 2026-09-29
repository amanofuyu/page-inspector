import type { Ref } from 'vue'
import type { DataNode } from '../nuxt/format'
import { computed, ref, watch } from 'vue'

/** 按路径重选当前快照中的节点，避免刷新后继续展示旧对象。 */
export function useDataSelection(root: Ref<DataNode | undefined>, context: Ref<string>) {
  const selectedPath = ref<string | null>(null)
  const visible = ref(true)
  const nodes = computed(() => {
    const indexed = new Map<string, DataNode>()
    const stack = root.value ? [root.value] : []
    while (stack.length) {
      const node = stack.pop()!
      indexed.set(node.path, node)
      if (node.children)
        stack.push(...node.children)
    }
    return indexed
  })
  const selected = computed(() => selectedPath.value ? nodes.value.get(selectedPath.value) ?? root.value : root.value)
  watch(context, () => {
    selectedPath.value = null
  }, { flush: 'sync' })
  watch(nodes, (value) => {
    if (selectedPath.value && !value.has(selectedPath.value))
      selectedPath.value = null
  }, { flush: 'sync' })
  function select(node: DataNode) {
    if (!nodes.value.has(node.path))
      return
    selectedPath.value = node.path
    visible.value = true
  }
  return { selected, visible, select }
}
