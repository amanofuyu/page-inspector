import { createApp } from 'vue'
import InspectorView from '@/features/inspector/InspectorView.vue'
import { setupHead, setupPinia } from '@/plugins'
import '~/assets/css/main.css'

const app = createApp(InspectorView, { targetTabId: chrome.devtools.inspectedWindow.tabId, devtools: true })
setupHead(app)
setupPinia(app)
app.mount('#app')
