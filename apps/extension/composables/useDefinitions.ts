import type { Definition } from '@/features/watch/model'
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { DEFINITION_PREFIX, validDefinition } from '@/features/watch/model'
import { sendMessage } from '@/libs/messaging'

export function useDefinitions() {
  const definitions = shallowRef<Definition[]>([])
  const storageNotice = ref('')
  let revision = 0
  let active = true
  const changes = (updates: Record<string, {
    newValue?: unknown
  }>, area: string) => {
    if (area !== 'local' || !Object.keys(updates).some(key => key.startsWith(DEFINITION_PREFIX)))
      return
    revision++
    const rules = new Map(definitions.value.map(rule => [rule.id, rule]))
    for (const [key, change] of Object.entries(updates)) {
      if (!key.startsWith(DEFINITION_PREFIX))
        continue
      rules.delete(key.slice(DEFINITION_PREFIX.length))
      if (validDefinition(change.newValue))
        rules.set(change.newValue.id, change.newValue)
      else if (change.newValue !== undefined)
        storageNotice.value = '已忽略无法识别的规则版本或损坏记录。'
    }
    definitions.value = [...rules.values()]
  }
  async function load() {
    const started = revision
    try {
      const stored = await browser.storage.local.get(null)
      if (!active)
        return
      if (started !== revision) {
        await load()
        return
      }
      const rules: Definition[] = []
      for (const [key, value] of Object.entries(stored)) {
        if (key.startsWith(DEFINITION_PREFIX)) {
          if (validDefinition(value))
            rules.push(value)
          else
            storageNotice.value = '已忽略无法识别的规则版本或损坏记录。'
        }
      }
      definitions.value = rules
    }
    catch {
      storageNotice.value = '无法读取本地规则。'
    }
  }
  onMounted(() => {
    browser.storage.onChanged.addListener(changes)
    void load()
  })
  onBeforeUnmount(() => {
    active = false
    browser.storage.onChanged.removeListener(changes)
  })
  async function save(definition: Definition) {
    await sendMessage('definition', { action: 'save', definition })
  }
  async function remove(id: string) {
    await sendMessage('definition', { action: 'delete', id })
  }
  return { definitions, storageNotice, save, remove }
}
