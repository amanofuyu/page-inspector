import type { DataNode } from './format'
import { uneval } from 'devalue'

export interface CopiedValue {
  text: string
  format: 'text' | 'json' | 'javascript'
}
const binaryTypes = new Set(['ArrayBuffer', 'DataView', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float16Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array'])
const baseType = (node: DataNode) => node.type.split(' → ').at(-1)!

/** 由完整节点树还原值；保留局部引用，避免复制预览摘要或把缺失内容当作完整数据。 */
export function copyNodeValue(root: DataNode): CopiedValue {
  const nodes = new Map<string, DataNode>()
  const stack = [root]
  while (stack.length) {
    const node = stack.pop()!
    if (node.truncated)
      throw new Error('当前值超出展示上限，请导出原文获取完整数据。')
    nodes.set(node.path, node)
    if (node.children)
      stack.push(...node.children)
  }
  const restored = new Map<string, unknown>()
  const references = new Set<string>()
  let jsonCompatible = true
  function restore(node: DataNode): any {
    if (restored.has(node.path))
      return restored.get(node.path)
    if (node.reference !== undefined) {
      jsonCompatible = false
      const target = nodes.get(node.reference)
      if (!target || references.has(node.path))
        throw new Error('当前值包含无法解析的引用，请复制带类型的数据或导出原文。')
      references.add(node.path)
      const value = restore(target)
      references.delete(node.path)
      return value
    }
    const type = baseType(node)
    switch (type) {
      case 'string': return node.value
      case 'boolean': return node.value
      case 'null': return null
      case 'number':
        if (typeof node.value === 'string')
          jsonCompatible = false
        return Number(node.value)
      case 'undefined':
      case 'empty':
        jsonCompatible = false
        return undefined
      case 'bigint':
        jsonCompatible = false
        return BigInt(node.value as string)
    }
    let value: any
    if (type === 'Object' || type === 'Object(null)') {
      value = type === 'Object(null)' ? Object.create(null) : {}
      restored.set(node.path, value)
      for (const child of node.children ?? []) {
        // 定义自有属性，避免 __proto__ 等业务键改变对象原型。
        Object.defineProperty(value, child.key, { value: restore(child), enumerable: true, writable: true, configurable: true })
      }
    }
    else if (type === 'Array') {
      value = []
      restored.set(node.path, value)
      for (const child of node.children ?? []) {
        const index = Number(child.key)
        if (baseType(child) === 'empty') {
          jsonCompatible = false
          value.length = index + 1
        }
        else { value[index] = restore(child) }
      }
    }
    else {
      jsonCompatible = false
      if (type === 'Map') {
        value = new Map()
        restored.set(node.path, value)
        for (const child of node.children ?? []) {
          const entry = restore(child)
          value.set(entry.key, entry.value)
        }
      }
      else if (type === 'Set') {
        value = new Set()
        restored.set(node.path, value)
        for (const child of node.children ?? [])
          value.add(restore(child))
      }
      else if (type === 'Date') {
        value = new Date(node.value as string)
      }
      else if (type === 'RegExp') {
        const literal = node.value as string
        const end = literal.lastIndexOf('/')
        value = new RegExp(literal.slice(1, end), literal.slice(end + 1))
      }
      else if (type === 'URL') {
        value = new URL(node.value as string)
      }
      else if (type === 'URLSearchParams') {
        value = new URLSearchParams(node.value as string)
      }
      else if (type.startsWith('Boxed')) {
        const scalar = type === 'BoxedBigInt' ? BigInt(node.value as string) : type === 'BoxedNumber' ? Number(node.value) : node.value
        value = new Object(scalar)
      }
      else if (binaryTypes.has(type)) {
        const buffer = Uint8Array.from((node.children ?? []).map(child => Number(child.value))).buffer
        if (type === 'ArrayBuffer') {
          value = buffer
        }
        else {
          const Constructor = (globalThis as unknown as Record<string, new (buffer: ArrayBuffer) => unknown>)[type]
          if (!Constructor)
            throw new Error(`当前环境无法复制 ${type}，请复制带类型的数据。`)
          value = new Constructor(buffer)
        }
      }
      else {
        throw new Error(`暂不支持直接复制 ${type}，请复制带类型的数据。`)
      }
    }
    restored.set(node.path, value)
    return value
  }
  const value = restore(root)
  if (typeof value === 'string')
    return { text: value, format: 'text' }
  if (jsonCompatible)
    return { text: JSON.stringify(value, null, 2), format: 'json' }
  const text = value === undefined ? 'undefined' : Object.is(value, -0) ? '-0' : uneval(value)
  return { text, format: 'javascript' }
}
