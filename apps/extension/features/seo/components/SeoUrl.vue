<script setup lang="ts">
import { computed } from 'vue'
import { safeSeoUrl } from '../page-data'

const props = defineProps<{ value: string, base?: string }>()
const url = computed(() => safeSeoUrl(props.value, props.base))
</script>

<template>
  <a v-if="url" :href="url" target="_blank" rel="noopener noreferrer" class="seo-url"><slot>{{ value }}</slot></a>
  <span v-else class="break-text"><slot>{{ value || '（无地址）' }}</slot></span>
</template>
