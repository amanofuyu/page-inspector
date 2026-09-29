<script setup lang="ts">
import { onMounted, ref, useHead, useSeoMeta } from '#imports'

const hydrated = ref(false)
useSeoMeta({
  title: () => hydrated.value ? 'SEO 客户端标题' : 'SEO 服务端标题',
  description: () => hydrated.value ? '水合后的描述' : 'HTML 中的描述',
  robots: () => hydrated.value ? 'index, follow' : 'noindex, follow',
  ogTitle: 'SSR 与预渲染共享标签',
  twitterCard: () => hydrated.value ? 'summary' : undefined,
})
useHead({
  link: [{ rel: 'canonical', href: 'https://example.test/seo' }, { rel: 'alternate', hreflang: 'en', href: 'https://example.test/en/seo' }],
  script: [{ type: 'application/ld+json', innerHTML: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', 'headline': '真实 Nuxt SEO 验证' }) }],
})
onMounted(() => {
  hydrated.value = true
})
</script>

<template>
  <section data-testid="seo-fixture">
    <h1>真实 Nuxt SEO 验证</h1><p>{{ hydrated ? '已水合' : '等待水合' }}</p><NuxtLink to="/csr">
      检查纯客户端 SEO
    </NuxtLink>
  </section>
</template>
