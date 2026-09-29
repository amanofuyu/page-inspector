<script setup lang="ts">
import { CircleAlert, Info, TriangleAlert } from '@lucide/vue'

withDefaults(defineProps<{
  severity?: 'info' | 'warning' | 'error'
  role?: 'status' | 'alert' | 'note'
  title?: string
}>(), { severity: 'info' })
</script>

<template>
  <div class="ui-notice notice" :class="`notice-${severity}`" :role="role ?? (severity === 'error' ? 'alert' : 'status')">
    <component :is="severity === 'error' ? CircleAlert : severity === 'warning' ? TriangleAlert : Info" class="ui-notice-icon" :size="16" aria-hidden="true" />
    <div class="ui-notice-content">
      <strong v-if="title" class="ui-notice-title">{{ title }}</strong>
      <slot />
      <div v-if="$slots.actions" class="ui-notice-actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>
