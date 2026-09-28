import tailwindcss from '@tailwindcss/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    plugins: [tailwindcss(), Components({ dirs: ['./components', './features'], dts: true, directoryAsNamespace: true })],
    build: { target: 'es2022' },
  }),
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    minimum_chrome_version: '116',
    permissions: ['storage', 'scripting'],
    host_permissions: ['http://*/*', 'https://*/*'],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    action: {
      default_title: '查看 Nuxt 数据',
      default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    },
    commands: {
      open_sidepanel: {
        suggested_key: { default: 'Ctrl+M', mac: 'Command+M' },
        description: '打开 Nuxt 数据侧边栏',
      },
    },
  },
})
