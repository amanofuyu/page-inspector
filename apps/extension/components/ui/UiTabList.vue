<script setup lang="ts">
import { Tabs } from '@ark-ui/vue/tabs'
import { motion } from 'motion-v'
import { useId } from 'vue'
import { useMotionPreferences } from '@/libs/motion'
import { useTabItems, useTabValue } from './tabs-context'

withDefaults(defineProps<{ label: string, variant?: 'view' | 'workspace' }>(), { variant: 'view' })
const items = useTabItems()
const value = useTabValue()
const indicatorId = `tab-indicator-${useId()}`
const { reduced, transition } = useMotionPreferences()
</script>

<template>
  <Tabs.List :aria-label="label" class="ui-tab-list" :class="variant === 'workspace' ? 'workspace-tabs' : 'view-tabs'">
    <Tabs.Trigger v-for="item in items" :key="item.id" :value="item.id" :disabled="item.disabled">
      <motion.span v-if="item.id === value" class="ui-tab-indicator" :layout-id="reduced ? undefined : indicatorId" :transition="transition" :initial="false" aria-hidden="true" />
      <component :is="item.icon" v-if="item.icon" :size="16" aria-hidden="true" />
      <span>{{ item.label }}</span>
    </Tabs.Trigger>
  </Tabs.List>
</template>
