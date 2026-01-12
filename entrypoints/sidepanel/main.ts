import { createApp } from 'vue'
import { setupHead, setupPinia } from '@/plugins'
import App from './App.vue'
import '~/assets/css/main.css'

async function bootstrap() {
  const app = createApp(App)

  setupHead(app)
  setupPinia(app)

  app.mount('#app')
}

bootstrap()
