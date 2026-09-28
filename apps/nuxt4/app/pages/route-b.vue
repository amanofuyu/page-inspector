<script setup lang="ts">
import { useAsyncData } from '#imports'

const { data } = await useAsyncData('route-b', async () => ({ marker: 'nuxt4-route-b' }))
</script>

<template>
  <section>
    <h2>路由 B</h2><p data-testid="route-marker">
      {{ data?.marker }}
    </p>
  </section>
</template>
