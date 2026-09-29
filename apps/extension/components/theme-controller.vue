<script setup lang="ts">
import { Monitor, Moon, Sun } from '@lucide/vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import { useTheme } from '@/composables/useTheme'

defineProps<{ compact?: boolean }>()
const { colorMode } = useTheme()
const themes = [
  { value: 'auto', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
] as const
</script>

<template>
  <UiSelect v-model="colorMode" :items="themes" label="界面主题" :icon-only="compact" size="xs" class="theme-picker" />
</template>
