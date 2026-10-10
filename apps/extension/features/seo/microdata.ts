import type { SeoMicrodataNode } from './model'
import { resolveSeoUrl } from './page-data'

interface MicrodataItem {
  type: string[]
  id?: string
  properties: Record<string, (string | MicrodataItem | null)[]>
}

/** 按 itemscope 边界读取属性，保留重复值，并防止 itemref 循环和指数展开。 */
export function readMicrodata(nodes: SeoMicrodataNode[], base: string) {
  const children = new Map<number | null, number[]>()
  const ids = new Map<string, number>()
  for (const [index, node] of nodes.entries()) {
    const list = children.get(node.parent) ?? []
    list.push(index)
    children.set(node.parent, list)
    if (node.attrs.id && !ids.has(node.attrs.id))
      ids.set(node.attrs.id, index)
  }
  let visits = 0
  let chars = 0
  const sizes = new WeakMap<MicrodataItem, number>()
  let truncated = false
  const tokens = (value = '') => value.trim().split(/\s+/).filter(Boolean)
  function item(index: number, ancestors: Set<number>): MicrodataItem | null {
    if (ancestors.has(index) || ancestors.size >= 30 || ++visits > 12000) {
      truncated = true
      return null
    }
    const node = nodes[index]!
    const nextAncestors = new Set([...ancestors, index])
    const result: MicrodataItem = { type: tokens(node.attrs.itemtype), properties: Object.create(null) }
    if (node.attrs.itemid)
      result.id = resolveSeoUrl(node.attrs.itemid, base) || node.attrs.itemid
    const refs = tokens(node.attrs.itemref).map(id => ids.get(id)).filter((value): value is number => value !== undefined)
    const pending = [...(children.get(index) ?? []), ...refs].reverse()
    const seen = new Set([index])
    let exhausted = false
    while (pending.length && !exhausted) {
      if (++visits > 12000) {
        truncated = true
        break
      }
      const position = pending.pop()!
      if (seen.has(position))
        continue
      seen.add(position)
      const child = nodes[position]!
      const scope = child.attrs.itemscope !== undefined
      const names = tokens(child.attrs.itemprop)
      if (names.length) {
        let value: string | MicrodataItem | null = child.text
        if (scope)
          value = item(position, nextAncestors)
        else if (child.tag === 'meta')
          value = child.attrs.content ?? ''
        else if (['audio', 'embed', 'iframe', 'img', 'source', 'track', 'video'].includes(child.tag))
          value = resolveSeoUrl(child.attrs.src, base)
        else if (['a', 'area', 'link'].includes(child.tag))
          value = resolveSeoUrl(child.attrs.href, base)
        else if (child.tag === 'object')
          value = resolveSeoUrl(child.attrs.data, base)
        else if (['data', 'meter'].includes(child.tag))
          value = child.attrs.value ?? ''
        else if (child.tag === 'time')
          value = child.attrs.datetime ?? child.text
        for (const name of names) {
          const size = name.length * 6 + 8 + (typeof value === 'string' ? value.length * 6 + 2 : value ? sizes.get(value) ?? 4 : 4)
          chars += size
          if (chars > 1024 * 1024 || ++visits > 12000) {
            truncated = true
            exhausted = true
            break
          }
          result.properties[name] ??= []
          result.properties[name]!.push(value)
        }
      }
      if (!scope)
        pending.push(...[...(children.get(position) ?? [])].reverse())
    }
    sizes.set(result, JSON.stringify(result).length)
    return result
  }
  const items = nodes.flatMap((node, index) => node.attrs.itemscope !== undefined && !tokens(node.attrs.itemprop).length ? [{ index, value: item(index, new Set()) }] : [])
  return { items, truncated }
}
