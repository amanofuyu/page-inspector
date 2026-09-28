<script setup lang="ts">
import { createError, useAsyncData } from '#imports'

const { error } = await useAsyncData('expected-error', async () => {
  throw createError({ statusCode: 422, statusMessage: '预期的业务错误', data: { code: 'FIXTURE_ERROR' } })
})
</script>

<template>
  <section><h2>受控错误</h2><p>{{ error?.statusCode }} · {{ error?.statusMessage }}</p></section>
</template>
