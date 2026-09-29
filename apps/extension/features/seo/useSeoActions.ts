import type { SeoSnapshot } from './model'
import type { ToastInput } from '@/composables/useToast'
import { useArtifactActions } from '@/composables/useArtifactActions'
import { seoMarkdown, seoReport } from './compare'

/** 副作用由业务容器调用，展示组件只上报复制与导出意图。 */
export function useSeoActions(source: { dom: () => SeoSnapshot | null, html: () => SeoSnapshot | null }, notice: (value: ToastInput) => void) {
  const artifacts = useArtifactActions(notice)
  function copy(text: string) {
    return artifacts.copy(text, '已复制 SEO 数据')
  }
  function download(format: 'json' | 'md') {
    const dom = source.dom()
    if (!dom)
      return
    const content = format === 'json' ? JSON.stringify(seoReport(dom, source.html()), null, 2) : seoMarkdown(dom, source.html())
    artifacts.download(content, `page-seo-${Date.now()}.${format}`, format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8', '已导出 SEO 报告，包含来源、覆盖范围和完整字段')
  }
  return { copy, download }
}
