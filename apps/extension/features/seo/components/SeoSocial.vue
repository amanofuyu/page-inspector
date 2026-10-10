<script setup lang="ts">
import type { SeoSnapshot } from '../model'
import { computed } from 'vue'
import { socialPreviews } from '../presentation'
import SeoUrl from './SeoUrl.vue'

const props = defineProps<{ snapshot: SeoSnapshot }>()
const previews = computed(() => socialPreviews(props.snapshot).filter(preview => preview.declared))
</script>

<template>
  <section v-if="previews.length" class="seo-social-previews" aria-label="分享预览">
    <h4 class="seo-details-heading">
      分享预览
    </h4>
    <div class="seo-social-grid">
      <article v-for="preview in previews" :key="preview.kind" class="seo-item seo-social-card">
        <header class="seo-record-heading">
          <strong>{{ preview.label }}</strong>
        </header>
        <img v-if="preview.image" :src="preview.image" alt="分享图片预览" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="seo-social-image">
        <div class="seo-social-text">
          <h5>{{ preview.title || '（未设置标题）' }}</h5>
          <p>{{ preview.description || '（未设置描述）' }}</p>
          <SeoUrl :value="preview.url" />
        </div>
      </article>
    </div>
    <p class="feature-caption">
      预览根据当前标签生成，实际分享展示由目标平台决定。
    </p>
  </section>
</template>
