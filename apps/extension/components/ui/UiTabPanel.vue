<script setup lang="ts">
import { Tabs } from '@ark-ui/vue/tabs'

defineProps<{ value: string }>()
</script>

<template>
  <Tabs.Content :value="value" as-child>
    <slot />
  </Tabs.Content>
</template>
