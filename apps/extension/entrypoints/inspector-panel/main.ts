import { createApp } from 'vue'
import InspectorView from '@/features/inspector/InspectorView.vue'
import '~/assets/css/main.css'

const app = createApp(InspectorView, { targetTabId: chrome.devtools.inspectedWindow.tabId, devtools: true })
app.mount('#app')
