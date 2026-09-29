<script setup lang="ts">
import type { SeoIssue } from '../model'
import UiActionButton from '@/components/ui/UiActionButton.vue'

defineProps<{ issues: readonly SeoIssue[] }>()
const emit = defineEmits<{ locate: [key: string] }>()
</script>

<template>
  <div class="seo-issues">
    <p v-if="!issues.length" class="empty-section">
      当前筛选范围内没有问题；不代表保证收录或通过全部富结果验证。
    </p>
    <article
      v-for="issue in issues"
      :key="issue.id"
      class="seo-issue"
      :data-level="issue.level"
    >
      <strong>{{
        { problem: '问题', review: '需要核对', info: '信息' }[issue.level]
      }}
        · {{ issue.title }}</strong>
      <p>{{ issue.detail }}</p>
      <UiActionButton
        v-if="issue.key"

        @click="emit('locate', issue.key)"
      >
        查看相关字段
      </UiActionButton>
    </article>
  </div>
</template>
