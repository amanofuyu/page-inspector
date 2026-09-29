<script setup lang="ts">
import { useAsyncData, useSeoMeta } from '#imports'

useSeoMeta({ title: '纯 CSR SEO 标题', description: '只由客户端生成的描述' })

const { data } = await useAsyncData('client-only', async () => ({ marker: '客户端后续数据' }))
</script>

<template>
  <section><h2>客户端页面</h2><p>{{ data?.marker }}</p></section>
</template>
