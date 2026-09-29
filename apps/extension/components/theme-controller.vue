<script setup lang="ts">
import { Monitor, Moon, Sun } from '@lucide/vue'
import { useTheme } from '@/composables/useTheme'

defineProps<{ compact?: boolean }>()
const { colorMode } = useTheme()
</script>

<template>
  <label class="theme-picker" :class="{ 'theme-picker-compact': compact }" title="界面主题">
    <Monitor v-if="colorMode === 'auto'" :size="14" aria-hidden="true" />
    <Sun v-else-if="colorMode === 'light'" :size="14" aria-hidden="true" />
    <Moon v-else :size="14" aria-hidden="true" />
    <select v-model="colorMode" class="select select-xs" aria-label="界面主题">
      <option value="auto">跟随系统</option>
      <option value="light">浅色</option>
      <option value="dark">深色</option>
    </select>
  </label>
</template>
