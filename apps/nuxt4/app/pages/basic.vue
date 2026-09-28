<script setup lang="ts">
import { useAsyncData, useFetch } from '#imports'

const { data } = await useAsyncData('products', () => Promise.resolve({ marker: 'nuxt4-basic', products: [{ id: 'sku-001', name: '测试商品', price: 128 }], empty: {}, flags: [false, 0, '', null] }))
const { data: api } = await useFetch('/api/catalog', { key: 'catalog' })
</script>

<template>
  <section><h2>普通数据</h2><pre data-testid="business-data">{{ data }}</pre><p>{{ api?.source }}</p></section>
</template>
