<script setup lang="ts">
import { CircleAlert, Search } from '@lucide/vue'

withDefaults(defineProps<{
  title?: string
  kind?: 'empty' | 'loading' | 'error'
  size?: 'inline' | 'compact' | 'panel'
  role?: 'status' | 'alert' | 'note'
}>(), { kind: 'empty', size: 'compact' })
</script>

<template>
  <section class="ui-empty-state" :class="[size === 'panel' ? 'empty-state' : size === 'inline' ? 'ui-empty-inline' : 'empty-section', { 'empty-state-error': kind === 'error' }]" :role="role ?? (kind === 'error' ? 'alert' : 'status')" :aria-busy="kind === 'loading' || undefined">
    <span v-if="size === 'panel' || $slots.icon" class="empty-state-icon" aria-hidden="true">
      <slot name="icon">
        <span v-if="kind === 'loading'" class="loading loading-spinner loading-md" />
        <component :is="kind === 'error' ? CircleAlert : Search" v-else :size="28" :stroke-width="1.5" />
      </slot>
    </span>
    <h2 v-if="title">
      {{ title }}
    </h2>
    <div class="ui-empty-description">
      <slot />
    </div>
    <div v-if="$slots.actions" class="ui-empty-actions">
      <slot name="actions" />
    </div>
  </section>
</template>
