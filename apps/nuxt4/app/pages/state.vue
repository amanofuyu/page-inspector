<script setup lang="ts">
import { useState } from '#imports'

const count = useState('counter', () => 7)
const enabled = useState('enabled', () => false)
</script>

<template>
  <section>
    <h2>初始状态</h2><p data-testid="counter">
      {{ count }}
    </p><p>{{ enabled }}</p><button @click="count++">
      增加计数
    </button>
  </section>
</template>
