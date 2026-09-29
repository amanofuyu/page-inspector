<script setup lang="ts">
import { Search } from '@lucide/vue'
import UiInput from './UiInput.vue'

defineProps<{ modelValue: string, label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <UiInput :model-value="modelValue" :label="label" type="search" clearable class="ui-search-input" @update:model-value="emit('update:modelValue', $event)">
    <template #leading>
      <Search :size="15" />
    </template>
  </UiInput>
</template>
