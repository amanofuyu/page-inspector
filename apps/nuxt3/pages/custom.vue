<script setup lang="ts">
import { useAsyncData } from '#imports'
import { Money } from '../utils/money'

const { data } = await useAsyncData('custom-price', async () => ({ price: new Money(128, 'CNY') }))
</script>

<template>
  <section><h2>自定义类型</h2><p>{{ data?.price.amount }} {{ data?.price.currency }}</p></section>
</template>
