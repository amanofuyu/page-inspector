<script setup lang="ts">
import { onMounted, ref } from 'vue'

const ready = ref(false)
onMounted(() => {
  ready.value = true
})
const routes = ['basic', 'types', 'state', 'errors', 'custom', 'route-a', 'route-b', 'empty', 'csr', 'large', 'features']
</script>

<template>
  <main :data-hydrated="ready" data-app="nuxt3">
    <h1>Nuxt 3 验证应用</h1>
    <p>版本 3.21.11 · 页面数据由 Nuxt 实际生成</p>
    <nav>
      <NuxtLink v-for="route in routes" :key="route" :to="`/${route}`" :prefetch="false">
        {{ route }}
      </NuxtLink>
    </nav>
    <NuxtPage />
  </main>
</template>

<style>
body {
  margin: 0;
  background: #f5f7fa;
  color: #18312e;
  font-family: system-ui, sans-serif;
}
main {
  max-width: 800px;
  padding: 32px;
  margin: auto;
}
nav {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 24px 0;
}
a {
  color: #087f6d;
}
button {
  padding: 8px 16px;
  cursor: pointer;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
