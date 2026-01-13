import type { HighlighterCore } from 'shiki/core'
import html from '@shikijs/langs/html'
import javascript from '@shikijs/langs/javascript'
import json from '@shikijs/langs/json'
import vitesseDark from '@shikijs/themes/vitesse-dark'
import vitesseLight from '@shikijs/themes/vitesse-light'
import { createHighlighterCoreSync } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import EngineOptions from 'shiki/wasm'

export function useShiki() {
  const highlighter = shallowRef<HighlighterCore | null>(null)

  async function initHighlighter() {
    const engine = await createOnigurumaEngine(EngineOptions)
    const $highlighter = createHighlighterCoreSync({
      themes: [vitesseDark, vitesseLight],
      langs: [html, json, javascript],
      engine,
    })

    highlighter.value = $highlighter

    return $highlighter
  }

  return {
    highlighter,
    initHighlighter,
  }
}
