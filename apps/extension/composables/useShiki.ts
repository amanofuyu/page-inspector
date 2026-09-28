import type { HighlighterCore } from 'shiki/core'
import { shallowRef } from 'vue'

const highlighter = shallowRef<HighlighterCore | null>(null)
let pending: Promise<HighlighterCore> | null = null
export function useShiki() {
  async function initHighlighter() {
    if (highlighter.value)
      return highlighter.value
    if (!pending) {
      pending = Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
        import('@shikijs/langs/json'),
        import('@shikijs/themes/vitesse-light'),
        import('@shikijs/themes/vitesse-dark'),
      ]).then(([core, engine, json, light, dark]) => {
        highlighter.value = core.createHighlighterCoreSync({
          langs: [json.default],
          themes: [light.default, dark.default],
          engine: engine.createJavaScriptRegexEngine(),
        })
        return highlighter.value
      }).catch((error) => {
        pending = null
        throw error
      })
    }
    return pending
  }
  return { highlighter, initHighlighter }
}
