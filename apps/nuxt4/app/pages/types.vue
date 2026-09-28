<script setup lang="ts">
import { useAsyncData } from '#imports'

const { data } = await useAsyncData('special-types', async () => {
  const shared: { name: string, self?: unknown } = { name: '共享节点' }
  shared.self = shared
  return { date: new Date('2026-01-01T00:00:00.000Z'), tags: new Set(['alpha', 'beta']), map: new Map([['key', 2]]), amount: 99n, pattern: /nuxt/gi, nan: Number.NaN, infinity: Infinity, minusZero: -0, cyclic: shared, shared }
})
</script>

<template>
  <section>
    <h2>特殊类型</h2><p data-testid="types-ready">
      {{ data?.date.toISOString() }} · {{ data?.tags.size }} · {{ data?.amount.toString() }}
    </p>
  </section>
</template>
