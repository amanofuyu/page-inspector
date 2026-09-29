<script setup lang="ts">
import { Tabs } from '@ark-ui/vue/tabs'
import { useTabItems } from './tabs-context'

withDefaults(defineProps<{ label: string, variant?: 'view' | 'workspace' }>(), { variant: 'view' })
const items = useTabItems()
</script>

<template>
  <Tabs.List :aria-label="label" :class="variant === 'workspace' ? 'workspace-tabs' : 'view-tabs'">
    <Tabs.Trigger v-for="item in items" :key="item.id" :value="item.id" :disabled="item.disabled">
      <component :is="item.icon" v-if="item.icon" :size="16" aria-hidden="true" />
      <span>{{ item.label }}</span>
    </Tabs.Trigger>
  </Tabs.List>
</template>
