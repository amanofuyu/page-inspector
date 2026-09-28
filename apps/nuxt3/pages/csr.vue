<script setup lang="ts">
import { useAsyncData } from '#imports'

const { data } = await useAsyncData('client-only', async () => ({ marker: '客户端后续数据' }))
</script>

<template>
  <section><h2>客户端页面</h2><p>{{ data?.marker }}</p></section>
</template>
