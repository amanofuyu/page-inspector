import { COLOR_MODE_KEY } from '@/constants/key'

(async function () {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  const setting = await storage.getItem<string>(COLOR_MODE_KEY) || 'auto'
  if (setting === 'dark' || (prefersDark && setting !== 'light'))
    document.documentElement.classList.toggle('dark', true)
})()
