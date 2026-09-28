import type { CollectedApp, ParsedApp, ParsedSource } from './types'
import { unflatten } from 'devalue'
import { isRecord, MAX_PAYLOAD_BYTES, PayloadTag, unwrap } from './types'

const builtinTypes = new Set([
  'Date',
  'Set',
  'Map',
  'RegExp',
  'Object',
  'BigInt',
  'null',
  'ArrayBuffer',
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float16Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
  'DataView',
  'URL',
  'URLSearchParams',
])
const nuxtTypes = new Set(['Ref', 'ShallowRef', 'Reactive', 'ShallowReactive', 'NuxtError', 'EmptyRef', 'EmptyShallowRef'])
function reviveEmpty(value: unknown): unknown {
  if (value === '_')
    return undefined
  if (value === '0n')
    return 0n
  if (typeof value !== 'string')
    throw new Error('空引用的值格式无效。')
  return JSON.parse(value)
}
export function parsePayload(text: string): {
  value: unknown
  unknownTypes: string[]
} {
  if (new TextEncoder().encode(text).byteLength > MAX_PAYLOAD_BYTES)
    throw new Error('数据超过解析体积上限，请导出原文查看。')
  const flattened: unknown = JSON.parse(text)
  if (!Array.isArray(flattened) || flattened.length === 0)
    throw new Error('不是支持的 Nuxt JSON payload 数据表。')
  const revivers: Record<string, (value: unknown) => unknown> = Object.create(null)
  const unknownTypes = new Set<string>()
  for (const entry of flattened) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string')
      continue
    const type = entry[0]
    if (builtinTypes.has(type) || type.startsWith('Temporal.'))
      continue
    if (!nuxtTypes.has(type))
      unknownTypes.add(type)
    revivers[type] = value => new PayloadTag(type, type === 'EmptyRef' || type === 'EmptyShallowRef' ? reviveEmpty(value) : value, !nuxtTypes.has(type))
  }
  return { value: unflatten(flattened, revivers), unknownTypes: [...unknownTypes] }
}
export function parseApp(app: CollectedApp): ParsedApp {
  const diagnostics: string[] = []
  let payload: Record<string, unknown> | null = null
  let unsupported = false
  const sources: ParsedSource[] = []
  const fieldSources: Record<string, string[]> = Object.create(null)
  // 内嵌先解析，外部字段按 Nuxt 的浅合并顺序覆盖；原文始终独立保留。
  for (const [index, source] of app.sources.entries()) {
    const sourceId = source.sourceId ?? `${app.id}:${index}`
    const detail: ParsedSource = { sourceId, payload: null, status: 'error' }
    sources.push(detail)
    const label = source.kind === 'inline' ? '内嵌数据' : '外部数据'
    if (source.error)
      diagnostics.push(`${label}：${source.error}`)
    if (source.text === null || !source.text.trim()) {
      detail.diagnostic = source.error || '原文为空或未取得'
      continue
    }
    try {
      const result = parsePayload(source.text)
      const value = unwrap(result.value)
      if (!isRecord(value))
        throw new Error('payload 根节点不是对象。')
      detail.payload = value
      detail.status = result.unknownTypes.length ? 'partial' : 'ready'
      for (const key of Object.keys(value))
        (fieldSources[key] ??= []).push(sourceId)
      payload = payload === null ? value : Object.assign(Object.create(null), payload, value)
      if (result.unknownTypes.length) {
        unsupported = true
        diagnostics.push(`以下类型仅展示序列化内容：${result.unknownTypes.join('、')}`)
      }
    }
    catch (error) {
      detail.diagnostic = `${label}解析失败：${error instanceof Error ? error.message : String(error)}`
      diagnostics.push(detail.diagnostic)
    }
  }
  if (app.externalUrl && !app.sources.some(source => source.kind === 'external'))
    diagnostics.push('页面声明了外部 payload，但尚未取得该数据。')
  if (!payload && !diagnostics.length)
    diagnostics.push('检测到 Nuxt 数据节点，但内容为空。')
  return {
    app,
    sources,
    fieldSources,
    payload,
    diagnostics,
    status: payload ? (diagnostics.length ? 'partial' : 'ready') : (unsupported ? 'unsupported' : 'error'),
  }
}
