<script setup lang="ts">
import type { SeoSnapshot } from '../model'
import { computed, ref, watch } from 'vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import { safeSeoUrl } from '../page-data'
import { imageCsv, linkCsv } from '../presentation'
import SeoMetrics from './SeoMetrics.vue'
import SeoUrl from './SeoUrl.vue'

const props = defineProps<{ snapshot: SeoSnapshot, kind: 'links' | 'images', search: string }>()
const emit = defineEmits<{ copy: [text: string], download: [text: string, filename: string, type: string] }>()
const filter = ref('all')
const unique = ref(false)
const limit = ref(50)
const links = computed(() => props.snapshot.page?.links ?? [])
const images = computed(() => props.snapshot.page?.images ?? [])
const uniqueLinks = computed(() => new Set(links.value.filter(link => link.href !== null).map(link => link.url || link.href)).size)
const counts = computed(() => props.kind === 'links'
  ? [{ label: '全部链接', value: links.value.length }, { label: '去重地址', value: uniqueLinks.value }, { label: '内链', value: links.value.filter(link => link.kind === 'internal').length }, { label: '外链', value: links.value.filter(link => link.kind === 'external').length }, { label: '其他链接', value: links.value.filter(link => link.kind === 'other').length }]
  : [{ label: '全部图片', value: images.value.length }, { label: '有 alt 文本', value: images.value.filter(image => image.alt?.trim()).length }, { label: '无 alt 文本', value: images.value.filter(image => !image.alt?.trim()).length }])
const search = computed(() => props.search.trim().toLocaleLowerCase())
const filteredLinks = computed(() => {
  const seen = new Set<string>()
  return links.value.filter((link) => {
    if (filter.value !== 'all' && link.kind !== filter.value)
      return false
    if (search.value && !`${link.href}\n${link.url}\n${link.text}\n${link.title}\n${link.rel.join(' ')}`.toLocaleLowerCase().includes(search.value))
      return false
    const key = link.url || link.href || link.id
    if (unique.value && seen.has(key))
      return false
    seen.add(key)
    return true
  })
})
const filteredImages = computed(() => images.value.filter(image => (filter.value === 'all' || (filter.value === 'with-alt' ? !!image.alt?.trim() : !image.alt?.trim())) && (!search.value || `${image.src}\n${image.url}\n${image.alt ?? ''}\n${image.title}`.toLocaleLowerCase().includes(search.value))))
const total = computed(() => props.kind === 'links' ? filteredLinks.value.length : filteredImages.value.length)
watch(() => [props.kind, props.snapshot.identity.documentId, props.snapshot.url], () => {
  filter.value = 'all'
  unique.value = false
  limit.value = 50
})
watch([filter, unique, search], () => {
  limit.value = 50
})
function download(full: boolean) {
  const text = props.kind === 'links' ? full ? linkCsv(filteredLinks.value) : filteredLinks.value.map(link => link.url || link.href || '').join('\n') : full ? imageCsv(filteredImages.value) : filteredImages.value.map(image => image.url || image.src || '').join('\n')
  emit('download', text, `seo-${props.kind}${full ? '.csv' : '.txt'}`, full ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8')
}
</script>

<template>
  <div class="seo-resources">
    <SeoMetrics :items="counts" :label="kind === 'links' ? '链接统计' : '图片统计'" />
    <div class="seo-resource-toolbar">
      <div class="seo-filters">
        <slot name="search" />
        <UiSelect v-model="filter" :label="kind === 'links' ? '链接类型' : '图片 alt 筛选'" :items="kind === 'links' ? [{ value: 'all', label: '全部链接' }, { value: 'internal', label: '内链' }, { value: 'external', label: '外链' }, { value: 'other', label: '其他链接' }] : [{ value: 'all', label: '全部图片' }, { value: 'with-alt', label: '有 alt 文本' }, { value: 'without-alt', label: '无 alt 文本' }]" />
        <UiActionButton v-if="kind === 'links'" :aria-pressed="unique" size="sm" @click="unique = !unique">
          {{ unique ? '显示重复链接' : '链接去重' }}
        </UiActionButton>
      </div>
      <div class="seo-actions">
        <UiActionButton :disabled="!total" size="sm" @click="download(false)">
          导出地址 TXT
        </UiActionButton>
        <UiActionButton :disabled="!total" size="sm" @click="download(true)">
          导出明细 CSV
        </UiActionButton>
      </div>
    </div>
    <div class="seo-result-heading">
      <h4>{{ kind === 'links' ? '链接明细' : '图片明细' }}</h4>
      <p class="feature-caption" role="status">
        {{ total }} 条匹配 · 已显示 {{ Math.min(limit, total) }} 条
      </p>
    </div>
    <p class="feature-caption">
      导出包含全部匹配项。
    </p>
    <template v-if="kind === 'links'">
      <article v-for="(link, index) in filteredLinks.slice(0, limit)" :key="link.id" class="seo-item seo-link-item">
        <header class="seo-record-heading">
          <span class="seo-record-number">{{ index + 1 }}</span>
          <span class="seo-chip">{{ { internal: '内链', external: '外链', other: '其他' }[link.kind] }}</span>
          <span v-if="link.truncated" class="seo-muted">已截断</span>
          <UiActionButton size="sm" @click="emit('copy', link.url || link.href || '')">
            复制链接
          </UiActionButton>
        </header>
        <strong class="seo-link-text">{{ link.text || '（无链接文字）' }}</strong>
        <dl class="seo-resource-details">
          <dt>目标地址</dt>
          <dd>
            <SeoUrl :value="link.url || link.href || ''" />
            <small v-if="link.href !== link.url">原始地址：{{ link.href ?? '无 href 属性' }}</small>
          </dd>
          <dt>rel</dt>
          <dd class="seo-tag-list">
            <span v-for="(rel, relIndex) in link.rel" :key="relIndex" class="seo-chip">{{ rel }}</span>
            <span v-if="!link.rel.length" class="seo-muted">未设置</span>
          </dd>
          <template v-if="link.title">
            <dt>title</dt><dd>{{ link.title }}</dd>
          </template>
        </dl>
      </article>
    </template>
    <template v-else>
      <article v-for="(image, index) in filteredImages.slice(0, limit)" :key="image.id" class="seo-item seo-image-item">
        <header class="seo-record-heading">
          <strong>图片 {{ index + 1 }}</strong>
          <span v-if="image.truncated" class="seo-muted">已截断</span>
          <UiActionButton size="sm" @click="emit('copy', image.url || image.src || '')">
            复制图片地址
          </UiActionButton>
        </header>
        <div class="seo-image-body">
          <div class="seo-thumbnail-wrap">
            <img v-if="safeSeoUrl(image.url)" :src="image.url" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="seo-thumbnail">
            <span v-else class="seo-muted">无预览</span>
          </div>
          <dl class="seo-resource-details">
            <dt>alt</dt><dd>{{ image.alt === null ? '无 alt 属性' : image.alt.trim() ? image.alt : '空 alt（可能为装饰性图片）' }}</dd>
            <dt>尺寸</dt><dd>{{ image.width || '未知' }} × {{ image.height || '未知' }}</dd>
            <template v-if="image.title">
              <dt>title</dt><dd>{{ image.title }}</dd>
            </template>
            <dt>图片地址</dt>
            <dd>
              <SeoUrl :value="image.url || image.src || ''" />
              <small v-if="image.src !== image.url">原始地址：{{ image.src ?? '无 src 属性' }}</small>
            </dd>
          </dl>
        </div>
      </article>
    </template>
    <UiEmptyState v-if="!total">
      当前筛选下没有匹配项。
    </UiEmptyState>
    <UiActionButton v-if="total > limit" size="sm" @click="limit += 50">
      再显示 50 项
    </UiActionButton>
  </div>
</template>
