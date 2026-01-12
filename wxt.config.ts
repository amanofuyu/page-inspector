import tailwindcss from '@tailwindcss/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'wxt'

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  webExt: {
    disabled: true,
  },
  vite: () => {
    return {
      plugins: [
        tailwindcss(),
        Components({
          dirs: ['./components', './features'],
          dts: true,
          directoryAsNamespace: true,
        }),
      ],
      build: {
        target: 'es2022',
      },
    }
  },
  manifest: ({ browser, manifestVersion, mode, command }) => {
    console.log(browser, manifestVersion, mode, command)

    return {
      name: '__MSG_extName__',
      description: '__MSG_extDescription__',
      default_locale: 'en',
      permissions: ['cookies', 'storage', 'scripting', 'commands', 'debugger'],
      host_permissions: [
        '*://*/*',
      ],
      content_security_policy: {
        extension_pages: 'script-src \'self\' \'wasm-unsafe-eval\'; object-src \'self\'',
      },
      commands: {
        open_sidepanel: {
          suggested_key: {
            default: 'Ctrl+M',
            mac: 'Command+M',
          },
          description: 'Open side panel',
        },
      },
    }
  },
})
