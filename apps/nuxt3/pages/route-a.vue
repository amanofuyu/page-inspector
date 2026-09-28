<script setup lang="ts">
import { useAsyncData } from '#imports'

const { data } = await useAsyncData('route-a', async () => ({ marker: 'nuxt3-route-a' }))
</script>

<template>
  <section>
    <h2>路由 A</h2><p data-testid="route-marker">
      {{ data?.marker }}
    </p>
  </section>
</template>
