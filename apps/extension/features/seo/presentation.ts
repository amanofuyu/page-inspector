import type { SeoField, SeoImage, SeoLink, SeoSnapshot } from './model'
import { GROUPS } from './model'
import { safeSeoUrl } from './page-data'

export const SEO_SECTIONS = [
  { id: 'overview', label: '概览', description: '查看页面信息、索引指令和内容数量。' },
  { id: 'headings', label: '标题', description: '按文档顺序查看 H1–H6，缩进表示标题级别。' },
  { id: 'links', label: '链接', description: '查看链接文字、目标地址和 rel 属性。' },
  { id: 'images', label: '图片', description: '查看图片预览、替代文本和尺寸。' },
  { id: 'structured', label: '结构化数据', description: '查看 JSON-LD、Microdata 和语言版本标签。' },
  { id: 'social', label: '社交分享', description: '查看分享预览和平台原始标签。' },
  { id: 'tools', label: '工具', description: '打开外部服务，进一步查看页面与站点数据。' },
] as const
export type SeoSection = typeof SEO_SECTIONS[number]['id']

export function sectionFields(fields: SeoField[], section: SeoSection, structured = 'all') {
  if (section === 'tools')
    return []
  if (section === 'structured')
    return fields.filter(field => (field.group === 'structured' || field.group === 'languages') && (structured === 'all' || (structured === 'hreflang' ? field.group === 'languages' : field.key === structured)))
  if (section === 'headings' || section === 'social')
    return fields.filter(field => field.group === section)
  return fields.filter(field => !['structured', 'headings', 'social'].includes(field.group))
}

/** 只调整展示分组，保留组内文档顺序和完整字段，不在展示层删减记录。 */
export function seoFieldGroups(fields: SeoField[], section: SeoSection) {
  const labels: Record<string, string> = section === 'structured'
    ? { jsonld: 'JSON-LD', microdata: 'Microdata', languages: '语言版本 · hreflang' }
    : section === 'social'
      ? { og: 'Open Graph 标签', twitter: 'X（Twitter）标签', other: '其他社交标签' }
      : { ...GROUPS, headings: '标题大纲' }
  const groups = new Map<string, { key: string, label: string, fields: SeoField[] }>()
  for (const field of fields) {
    const key = section === 'structured'
      ? field.group === 'languages' ? 'languages' : field.key
      : section === 'social'
        ? field.key.startsWith('meta:og:') ? 'og' : field.key.startsWith('meta:twitter:') ? 'twitter' : 'other'
        : field.group
    let group = groups.get(key)
    if (!group) {
      group = { key, label: labels[key] ?? field.label, fields: [] }
      groups.set(key, group)
    }
    group.fields.push(field)
  }
  return [...groups.values()]
}

export function seoOverview(snapshot: SeoSnapshot) {
  const keys = [
    ['title', '标题'],
    ['meta:description', '描述'],
    ['link:canonical', 'Canonical'],
    ['meta:robots', 'Robots'],
    ['http:x-robots-tag', 'X-Robots-Tag'],
    ['meta:keywords', '关键词'],
    ['meta:publisher', '发布者'],
    ['html:lang', '语言'],
  ] as const
  return keys.map(([key, label]) => ({ key, label, fields: snapshot.fields.filter(field => field.key === key), state: key.startsWith('http:') && !snapshot.headers ? '未读取响应头' : snapshot.complete ? '未设置' : '未采集到' }))
}

export function headingText(fields: SeoField[]) {
  return fields.filter(field => field.group === 'headings').map(field => `${field.label}: ${field.value.trim()}`).join('\n')
}

/** CSV 保留引号、换行和中文，同时防止字段被电子表格解释为公式。 */
export function seoCsv(rows: (string | number | null)[][]) {
  return `\uFEFF${rows.map(row => row.map((value) => {
    const text = String(value ?? '')
    const safe = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text
    return `"${safe.replaceAll('"', '""')}"`
  }).join(',')).join('\r\n')}`
}

export function linkCsv(links: SeoLink[]) {
  return seoCsv([['原始地址', '完整地址', '类型', '链接文字', '标题', 'rel', '截断'], ...links.map(link => [link.href, link.url, { internal: '内链', external: '外链', other: '其他' }[link.kind], link.text, link.title, link.rel.join(' '), link.truncated ? '是' : '否'])])
}

export function imageCsv(images: SeoImage[]) {
  return seoCsv([['原始地址', '完整地址', 'alt', 'alt 状态', '标题', '宽度', '高度', '截断'], ...images.map(image => [image.src, image.url, image.alt, image.alt === null ? '无 alt 属性' : image.alt.trim() ? '有 alt 文本' : '空 alt', image.title, image.width, image.height, image.truncated ? '是' : '否'])])
}

export function socialPreviews(snapshot: SeoSnapshot) {
  const value = (key: string) => snapshot.fields.find(field => field.key === `meta:${key}`)?.value ?? ''
  const title = snapshot.fields.find(field => field.key === 'title')?.value ?? ''
  const description = value('description')
  const og = { kind: 'og', label: 'Open Graph', title: value('og:title') || title, description: value('og:description') || description, image: safeSeoUrl(value('og:image:secure_url') || value('og:image') || value('og:image:url'), snapshot.page?.baseUrl || snapshot.url), url: safeSeoUrl(value('og:url') || snapshot.url, snapshot.page?.baseUrl || snapshot.url), declared: snapshot.fields.some(field => field.key.startsWith('meta:og:')) }
  return [og, { kind: 'twitter', label: 'X（Twitter）', title: value('twitter:title') || og.title, description: value('twitter:description') || og.description, image: safeSeoUrl(value('twitter:image') || value('twitter:image:src'), snapshot.page?.baseUrl || snapshot.url) || og.image, url: og.url, declared: snapshot.fields.some(field => field.key.startsWith('meta:twitter:')) || og.declared }]
}
