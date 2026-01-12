import type { App } from 'vue'
import { createPinia } from 'pinia'

export const pinia = createPinia()

export function setupPinia(app: App) {
  app.use(pinia)
}
