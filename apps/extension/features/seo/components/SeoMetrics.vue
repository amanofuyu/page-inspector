<script setup lang="ts">
defineProps<{ items: readonly { label: string, value: number | string }[], label: string }>()
</script>

<template>
  <dl class="seo-metrics" :aria-label="label">
    <div v-for="item in items" :key="item.label">
      <dt>{{ item.label }}</dt>
      <dd>{{ typeof item.value === 'number' ? item.value.toLocaleString() : item.value }}</dd>
    </div>
  </dl>
</template>
