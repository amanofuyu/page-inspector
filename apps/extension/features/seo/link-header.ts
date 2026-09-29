/** 保留引号与 URI 中的分隔符；不从格式不完整的 Link 项推断规范地址。 */
function split(value: string, delimiter: string) {
  const parts: string[] = []
  let start = 0
  let quoted = false
  let uri = false
  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (quoted && char === '\\') {
      index++
      continue
    }
    if (char === '"' && !uri) {
      quoted = !quoted
    }
    else if (!quoted && char === '<') {
      uri = true
    }
    else if (!quoted && char === '>') {
      uri = false
    }
    else if (!quoted && !uri && char === delimiter) {
      parts.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  if (!quoted && !uri)
    parts.push(value.slice(start).trim())
  return parts
}

/** RFC 8288：相对 URL 以响应地址解析；带 anchor 的项不作为本页 canonical。 */
export function headerCanonicals(value: string, url: string) {
  const result: { target: string, snippet: string }[] = []
  for (const entry of split(value, ',')) {
    const [target, ...parameters] = split(entry, ';')
    const reference = /^<([^<>]*)>$/.exec(target ?? '')?.[1]
    if (reference === undefined)
      continue
    const attrs = new Map<string, string>()
    let valid = true
    for (const parameter of parameters) {
      const match
        = /^([\w!#$%&'*+.^`|~-]+)\s*(?:=\s*("(?:[^"\\]|\\.)*"|[\w!#$%&'*+.^`|~-]+))?$/.exec(
          parameter,
        )
      if (!match) {
        valid = false
        break
      }
      const key = match[1]!.toLowerCase()
      const raw = match[2] ?? ''
      const content = raw.startsWith('"')
        ? raw.slice(1, -1).replace(/\\(.)/g, '$1')
        : raw
      if (!attrs.has(key))
        attrs.set(key, content)
    }
    if (
      !valid
      || attrs.has('anchor')
      || !attrs.get('rel')?.toLowerCase().split(/\s+/).includes('canonical')
    ) {
      continue
    }
    try {
      result.push({
        target: new URL(reference, url).href,
        snippet: `Link: ${entry}`,
      })
    }
    catch {
      // 原始 Link 响应头仍可查看；无效 URL 不产生派生字段。
    }
  }
  return result
}
