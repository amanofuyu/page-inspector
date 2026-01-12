<script setup lang="ts">
import { cn } from '@gamsai/ui/lib/cn'
import { COLOR_MODE_KEY } from '@/constant/key'

const props = defineProps<{
  class?: string
}>()

const show = ref(false)

const rootRef = useTemplateRef<HTMLElement>('rootRef')

const html = computed(() => {
  if (rootRef.value) {
    return rootRef.value.closest('html')
  }

  return null
})

const isDark = ref(false)

storage.getItem(COLOR_MODE_KEY).then((colorMode) => {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches

  if (colorMode === 'dark' || (prefersDark && colorMode !== 'light')) {
    isDark.value = true
  }

  show.value = true
})

onMounted(() => {
  const changeColorMode = (message: { type: string, data: boolean }) => {
    if (message.type === 'colorModeChanged') {
      isDark.value = message.data
    }
  }

  browser.runtime.onMessage.addListener(changeColorMode)

  onUnmounted(() => {
    browser.runtime.onMessage.removeListener(changeColorMode)
  })
})

watchEffect(() => {
  if (html.value) {
    html.value.classList.toggle('dark', isDark.value)
  }
})
</script>

<template>
  <div v-show="show" ref="rootRef" :class="cn(props.class)">
    <slot />
  </div>
</template>

<style scoped></style>
