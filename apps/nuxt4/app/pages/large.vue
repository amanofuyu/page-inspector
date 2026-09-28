<script setup lang="ts">
import { useAsyncData, useState } from '#imports'

const { data } = await useAsyncData('large-records', async () => Array.from({ length: 15000 }, (_, id) => ({ id, text: `项目 ${id}` })))
const available = useState('available', () => true)
</script>

<template>
  <section><h2>大数据</h2><p>{{ data?.length }} 项 · {{ available }}</p></section>
</template>
