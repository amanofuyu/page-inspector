<script setup lang="ts">
import type { SeoSnapshot } from '../model'
import type { SeoHeaderSample } from '../requests'
import { computed } from 'vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import { seoOverview } from '../presentation'
import SeoMetrics from './SeoMetrics.vue'
import SeoUrl from './SeoUrl.vue'

const props = defineProps<{ snapshot: SeoSnapshot, headerSample?: SeoHeaderSample | null }>()
const emit = defineEmits<{ copy: [text: string] }>()
const cards = computed(() => seoOverview(props.snapshot).map(card => card.key === 'http:x-robots-tag' && !props.snapshot.headers && props.headerSample ? { ...card, state: '未设置', fields: props.headerSample.headers.filter(header => header.name === 'x-robots-tag').map((header, index) => ({ id: `head:${index}`, value: header.value, truncated: header.truncated })) } : card))
const headings = computed(() => Array.from({ length: 6 }, (_, index) => ({ label: `H${index + 1}`, count: props.snapshot.fields.filter(field => field.key === `heading:h${index + 1}`).length })))
const groups = computed(() => [
  { key: 'page', label: '页面信息', cards: cards.value.filter(card => ['title', 'meta:description', 'meta:keywords', 'meta:publisher', 'html:lang'].includes(card.key)) },
  { key: 'indexing', label: '索引设置', cards: cards.value.filter(card => ['link:canonical', 'meta:robots', 'http:x-robots-tag'].includes(card.key)) },
])
const counts = computed(() => [
  { label: '链接', value: props.snapshot.page?.links.length ?? 0 },
  { label: '图片', value: props.snapshot.page?.images.length ?? 0 },
  { label: '正文词数', value: props.snapshot.page?.wordCount ?? '未采集' },
])
const root = computed(() => new URL(props.snapshot.url).origin)
</script>

<template>
  <div class="seo-overview">
    <SeoMetrics :items="counts" label="页面元素统计" />
    <div class="seo-overview-columns">
      <section v-for="group in groups" :key="group.key" class="seo-block" :aria-label="group.label">
        <header class="seo-block-heading">
          <h4>{{ group.label }}</h4>
          <slot v-if="group.key === 'indexing'" name="header-actions" />
        </header>
        <dl class="seo-definition-list">
          <div v-if="group.key === 'page'" class="seo-definition-row">
            <dt>页面地址</dt>
            <dd>
              <div class="seo-value-heading">
                <SeoUrl :value="snapshot.url" />
                <UiActionButton size="sm" @click="emit('copy', snapshot.url)">
                  复制地址
                </UiActionButton>
              </div>
            </dd>
          </div>
          <div v-for="card in group.cards" :key="card.key" class="seo-definition-row" :data-overview="card.key">
            <dt>{{ card.label }}</dt>
            <dd>
              <template v-if="card.fields.length">
                <div v-for="field in card.fields.slice(0, 3)" :key="field.id" class="seo-overview-value">
                  <div class="seo-value-heading">
                    <small>{{ field.value.length.toLocaleString() }} 字符{{ field.truncated ? ' · 已截断' : '' }}</small>
                    <UiActionButton size="sm" :label="`复制概览 ${card.label}`" @click="emit('copy', field.value)">
                      复制
                    </UiActionButton>
                  </div>
                  <p :class="{ 'seo-page-title': card.key === 'title' }">
                    {{ field.value.slice(0, 600) || '（空值）' }}
                  </p>
                  <small v-if="field.value.length > 600">预览前 600 字符，复制保留已采集原文。</small>
                </div>
                <small v-if="card.fields.length > 3">共 {{ card.fields.length }} 条标签，完整已采集列表见下方字段。</small>
              </template>
              <span v-else class="seo-muted">{{ card.state }}</span>
            </dd>
          </div>
        </dl>
        <template v-if="group.key === 'indexing'">
          <p v-if="headerSample" class="feature-caption">
            单独 HEAD 请求：HTTP {{ headerSample.status }} · {{ headerSample.url }} · {{ new Date(headerSample.sampledAt).toLocaleTimeString() }}；响应头可能与页面加载时不同。
          </p>
          <slot name="header-notice" />
          <div class="seo-actions seo-file-links">
            <span class="seo-muted">站点文件</span>
            <SeoUrl :value="`${root}/robots.txt`">
              robots.txt
            </SeoUrl>
            <SeoUrl :value="`${root}/sitemap.xml`">
              sitemap.xml
            </SeoUrl>
          </div>
        </template>
      </section>
    </div>
    <section class="seo-block seo-content-counts" aria-label="内容统计">
      <h4>标题分布</h4>
      <dl class="seo-heading-counts">
        <div v-for="heading in headings" :key="heading.label">
          <dt>{{ heading.label }}</dt><dd>{{ heading.count.toLocaleString() }}</dd>
        </div>
      </dl>
      <p class="feature-caption">
        正文词数按空白分隔计数；采集不完整时，数量仅代表已读取部分。
      </p>
    </section>
  </div>
</template>
