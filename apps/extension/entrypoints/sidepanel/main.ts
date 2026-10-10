import { createApp } from 'vue'
import App from './App.vue'
import '~/assets/css/main.css'

async function bootstrap() {
  const app = createApp(App)

  app.mount('#app')
}

bootstrap()
