import type { Definition } from './model'
import { DEFINITION_PREFIX, validDefinition } from './model'

let queue: Promise<unknown> = Promise.resolve()
/** 后台串行写入，并用独立规则键避免侧栏与 DevTools 的数组覆盖竞争。 */
export function mutateDefinition(request: {
  action: 'save'
  definition: Definition
} | {
  action: 'delete'
  id: string
}): Promise<void> {
  const operation = queue.catch(() => {
  }).then(async () => {
    if (request.action === 'delete') {
      if (!/^[\w-]{1,80}$/.test(request.id))
        throw new Error('规则编号无效。')
      await browser.storage.local.remove(DEFINITION_PREFIX + request.id)
      return
    }
    const definition = request.definition
    if (!validDefinition(definition))
      throw new Error('规则格式无效。')
    const stored = await browser.storage.local.get(null)
    const rules = Object.entries(stored).filter(([key, value]) => key.startsWith(DEFINITION_PREFIX) && validDefinition(value)).map(([, value]) => value as Definition)
    const peers = rules.filter(rule => rule.id !== definition.id && rule.kind === definition.kind && (['origin', 'pathname', 'app', 'query'] as const).every(key => rule.scope[key] === definition.scope[key]))
    if (peers.length >= 50 || (rules.length >= 500 && !rules.some(rule => rule.id === definition.id)))
      throw new Error('已达到规则数量上限（每个范围 50 项，共 500 项）。')
    await browser.storage.local.set({ [DEFINITION_PREFIX + definition.id]: definition })
  })
  queue = operation
  return operation
}
