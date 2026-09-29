import type { SeoField, SeoIssue, SeoRow, SeoSnapshot } from './model'
import { CHANGES, GROUPS, sameSeoIdentity } from './model'

export function compareSeo(
  dom: SeoSnapshot,
  html: SeoSnapshot | null,
): SeoRow[] {
  const compatible = !!html && sameSeoIdentity(dom.identity, html.identity)
  const baseline = compatible ? html : null
  const keys = new Set(
    [...dom.fields, ...(baseline?.fields ?? [])].map(field => field.key),
  )
  const rows: SeoRow[] = []
  for (const key of keys) {
    const current = dom.fields.filter(field => field.key === key)
    const previous = baseline?.fields.filter(field => field.key === key) ?? []
    for (
      let index = 0;
      index < Math.max(current.length, previous.length);
      index++
    ) {
      const a = previous[index]
      const b = current[index]
      const field = (b ?? a)!
      let change: SeoRow['change'] = 'unknown'
      if (field.group === 'transport') {
        change = 'transport'
      }
      else if (baseline?.source === 'refetch-reference') {
        change = 'reference'
      }
      else if (
        baseline?.association === 'matched'
        && !a?.truncated
        && !b?.truncated
      ) {
        if (a && b)
          change = a.normalized === b.normalized ? 'initial' : 'changed'
        else if (a && dom.complete)
          change = 'removed'
        else if (b && baseline.complete)
          change = 'added'
      }
      rows.push({
        id: `${key}:${index + 1}`,
        key,
        label: `${field.label}${Math.max(current.length, previous.length) > 1 ? ` · ${index + 1}` : ''}`,
        group: field.group,
        html: a,
        dom: b,
        change,
      })
    }
  }
  // 固定字段即使缺失也可检索；占位行不伪造采集值或初始来源。
  for (const [key, label, group] of [
    ['title', 'title', 'basic'],
    ['meta:description', 'description', 'basic'],
    ['link:canonical', 'canonical', 'indexing'],
  ] as const) {
    if (!keys.has(key))
      rows.push({ id: `${key}:1`, key, label, group, change: 'unknown' })
  }
  return rows
}
function byKey(snapshot: SeoSnapshot, key: string) {
  return snapshot.fields.filter(field => field.key === key)
}
function noindex(fields: SeoField[]) {
  return fields.some(field =>
    /(?:^|[\s,:;])(?:noindex|none)(?:$|[\s,;])/i.test(field.value),
  )
}
export function inspectSeo(
  dom: SeoSnapshot,
  html: SeoSnapshot | null,
  rows = compareSeo(dom, html),
): SeoIssue[] {
  if (html && !sameSeoIdentity(dom.identity, html.identity))
    html = null
  const issues: SeoIssue[] = []
  const add = (
    id: string,
    level: SeoIssue['level'],
    title: string,
    detail: string,
    key: string,
  ) => issues.push({ id, level, title, detail, key })
  for (const [key, label] of [
    ['title', 'title'],
    ['meta:description', 'description'],
  ] as const) {
    const fields = byKey(dom, key)
    if (!fields.length && dom.complete) {
      add(
        `missing-${key}`,
        'review',
        `缺少 ${label}`,
        '当前 DOM 的完整扫描中未发现该标签，请结合页面用途补充。',
        key,
      )
    }
    if (fields.some(field => !field.value.trim())) {
      add(
        `empty-${key}`,
        'review',
        `${label} 内容为空`,
        '标签存在但没有内容；请检查生成条件或异步数据。',
        key,
      )
    }
    if (fields.length > 1) {
      add(
        `duplicate-${key}`,
        'review',
        `${label} 重复定义`,
        `发现 ${fields.length} 个标签，逐项核对，避免不同来源相互覆盖。`,
        key,
      )
    }
  }
  for (const source of [dom, ...(html ? [html] : [])]) {
    const label
      = source.source === 'live-dom'
        ? 'DOM'
        : source.source === 'refetch-reference'
          ? '参考 HTML'
          : 'HTML'
    const canonicals = [
      ...byKey(source, 'link:canonical'),
      ...byKey(source, 'http:canonical'),
    ].filter(field => !field.truncated)
    if (new Set(canonicals.map(field => field.normalized)).size > 1) {
      add(
        `canonical-${source.source}`,
        'problem',
        `${label} 的 canonical 存在冲突`,
        'HTML 标签或 HTTP Link 中的多个 canonical 指向不同地址。跨域 canonical 本身不代表错误，应核对预期规范地址。',
        'link:canonical',
      )
    }
    for (const field of source.fields) {
      if (field.jsonError) {
        add(
          `json-${source.source}-${field.id}`,
          'problem',
          `${label} JSON-LD 无法解析`,
          field.jsonError,
          field.key,
        )
      }
      if (
        field.key === 'link:canonical'
        && (!field.value.trim() || !/^https?:\/\//i.test(field.normalized))
      ) {
        add(
          `url-${source.source}-${field.id}`,
          'review',
          `${label} canonical 地址需要核对`,
          '地址为空、无效或不是 HTTP(S) URL。',
          field.key,
        )
      }
    }
  }
  for (const row of rows) {
    if (row.key === 'link:canonical' && row.change === 'changed') {
      add(
        'canonical-changed',
        'review',
        'canonical 在运行后发生变化',
        '确认这是同一路由的预期行为，避免初始 HTML 和运行后指向不同规范页。',
        row.key,
      )
    }
  }
  const robots = dom.fields.filter(
    field =>
      field.key === 'meta:robots' || field.key.startsWith('meta:googlebot'),
  )
  for (const field of robots.filter(field => noindex([field]))) {
    add(
      `robots-${field.id}`,
      'info',
      `${field.label} 包含禁止索引指令`,
      '若该页面本来不应收录，这是预期配置。通用规则与特定爬虫规则需共同核对；冲突时 Google 使用更严格的限制。',
      field.key,
    )
  }
  if (html) {
    for (const field of html.fields.filter(
      field =>
        (field.key === 'meta:robots'
          || field.key.startsWith('meta:googlebot'))
        && noindex([field]),
    )) {
      if (
        dom.complete
        && !field.truncated
        && !noindex(dom.fields.filter(current => current.key === field.key))
      ) {
        add(
          `initial-noindex-${field.id}`,
          'review',
          html.source === 'refetch-reference'
            ? '参考 HTML 含 noindex，当前 DOM 未保留'
            : '初始 HTML 的 noindex 在运行后被移除',
          'Google 可能因初始 noindex 跳过渲染；如果希望该页面收录，不能依赖客户端移除。参考响应不能证明本次导航曾有该标签。',
          field.key,
        )
      }
    }
    for (const field of html.fields.filter(
      field => field.key === 'http:x-robots-tag',
    )) {
      add(
        `header-${field.id}`,
        'info',
        '存在 HTTP 索引规则',
        `${field.value}。响应头规则独立于 DOM；核对其中的爬虫限定及更严格限制。`,
        field.key,
      )
    }
    if (html.status && html.status >= 400) {
      add(
        'http-status',
        'review',
        `文档响应为 HTTP ${html.status}`,
        '状态码来自标注的 HTML 来源，不由页面显示内容推测。',
        'http:status',
      )
    }
  }
  if (!dom.complete || (html && !html.complete)) {
    add(
      'partial',
      'info',
      '采集仅部分完成',
      '部分字段或正文超出预算，不能把未采集到的字段视为缺失。',
      '',
    )
  }
  return issues
}
export function seoReport(dom: SeoSnapshot, html: SeoSnapshot | null) {
  const rows = compareSeo(dom, html)
  return {
    format: 'page-inspector-seo/v1',
    exportedAt: new Date().toISOString(),
    dom,
    html,
    rows,
    issues: inspectSeo(dom, html, rows),
    scope: '当前主文档；不代表搜索引擎实际索引或完整富结果验证。',
  }
}
export function seoMarkdown(dom: SeoSnapshot, html: SeoSnapshot | null) {
  const report = seoReport(dom, html)
  const cell = (text: string) =>
    text.replace(/[\\`*_[\]<>#|]/g, '\\$&').replace(/\r?\n/g, ' ')
  return `# 页面 SEO 检查\n\n页面：${cell(dom.url)}\n\nHTML 来源：${html?.source ?? '未采集'}\n\n${report.scope}\n\n| 字段 | 分组 | 状态 | HTML | DOM |\n| --- | --- | --- | --- | --- |\n${report.rows.map(row => `| ${cell(row.label)} | ${GROUPS[row.group]} | ${CHANGES[row.change]} | ${cell(row.html?.value ?? '未取得')} | ${cell(row.dom?.value ?? '未发现')} |`).join('\n')}\n\n## 问题与提示\n\n${report.issues.map(issue => `- ${cell(issue.title)}：${cell(issue.detail)}`).join('\n')}\n`
}
