import type { SeoField } from './model'

const PREVIEW_LIMIT = 16000

/** 只调整 JSON 标记之间的空白，保留数字精度、重复键与字符串转义。 */
export function seoFieldPreview(field: SeoField) {
  const source = field.group === 'structured' ? field.value : field.snippet
  if (field.group !== 'structured' || field.jsonError || field.truncated) {
    return { text: source.slice(0, PREVIEW_LIMIT), truncated: source.length > PREVIEW_LIMIT }
  }
  let text = ''
  let depth = 0
  let previous = ''
  // JSON 有效性已在采集阶段检查；按标记排版，达到预览预算立即停止。
  for (const match of source.matchAll(/"(?:[^"\\]|\\.)*"|[{}[\],:]|[^\s{}[\],:"]+/g)) {
    const token = match[0]
    let prefix = ''
    if (token === '}' || token === ']') {
      depth = Math.max(0, depth - 1)
      if (previous !== '{' && previous !== '[')
        prefix = `\n${'  '.repeat(depth)}`
    }
    else if (previous === '{' || previous === '[' || previous === ',') {
      prefix = `\n${'  '.repeat(depth)}`
    }
    text += (prefix + (token === ':' ? ': ' : token)).slice(0, PREVIEW_LIMIT + 1 - text.length)
    if (text.length > PREVIEW_LIMIT)
      return { text: text.slice(0, PREVIEW_LIMIT), truncated: true }
    if (token === '{' || token === '[')
      depth++
    previous = token
  }
  return { text, truncated: false }
}
