import type { SeoHtmlInput } from '../features/seo/model'
import { parseSeoHtml } from '../features/seo/parse-html'

globalThis.onmessage = (event: MessageEvent<SeoHtmlInput>) => {
  try {
    globalThis.postMessage({ snapshot: parseSeoHtml(event.data) })
  }
  catch (error) {
    globalThis.postMessage({
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
