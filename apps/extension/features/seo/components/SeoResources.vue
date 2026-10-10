<script setup lang="ts">
import type { SeoImage, SeoSnapshot } from '../model'
import { Copy } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import { safeSeoUrl } from '../page-data'
import { imageCsv, linkCsv } from '../presentation'
import SeoImagePreview from './SeoImagePreview.vue'
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
function imageName(image: SeoImage, index: number) {
  const url = safeSeoUrl(image.url)
  if (url) {
    const filename = new URL(url).pathname.split('/').at(-1)
    if (filename) {
      try {
        return decodeURIComponent(filename)
      }
      catch {
        return filename
      }
    }
  }
  return image.title || `图片 ${index + 1}`
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
    <div class="seo-resource-results-heading">
      <div class="seo-result-heading">
        <h4>{{ kind === 'links' ? '链接明细' : '图片明细' }}</h4>
        <p class="feature-caption" role="status">
          {{ total }} 条匹配 · 已显示 {{ Math.min(limit, total) }} 条
        </p>
      </div>
      <p class="feature-caption">
        导出包含全部匹配项。
      </p>
    </div>
    <div v-if="kind === 'links'" class="seo-links-list">
      <article v-for="(link, index) in filteredLinks.slice(0, limit)" :key="link.id" class="seo-item seo-resource-card seo-link-item">
        <header class="seo-resource-heading">
          <span class="seo-resource-number">{{ index + 1 }}</span>
          <div class="seo-resource-heading-content">
            <h5 class="seo-resource-title">
              {{ link.text || '（无链接文字）' }}
            </h5>
            <div class="seo-resource-meta">
              <span class="seo-chip seo-link-kind" :data-kind="link.kind">{{ { internal: '内链', external: '外链', other: '其他' }[link.kind] }}</span>
              <span v-if="link.truncated" class="seo-chip">已截断</span>
            </div>
          </div>
          <UiActionButton icon-only size="sm" label="复制链接" :disabled="!(link.url || link.href || '').trim()" @click="emit('copy', link.url || link.href || '')">
            <Copy :size="16" aria-hidden="true" />
          </UiActionButton>
        </header>
        <div class="seo-resource-address">
          <span class="seo-resource-label">目标地址</span>
          <SeoUrl class="seo-resource-url" :value="link.url || link.href || ''" />
        </div>
        <dl class="seo-resource-details seo-link-attributes">
          <div class="seo-resource-property">
            <dt>rel</dt>
            <dd class="seo-tag-list">
              <span v-for="(rel, relIndex) in link.rel" :key="relIndex" class="seo-chip">{{ rel }}</span>
              <span v-if="!link.rel.length" class="seo-muted">未设置</span>
            </dd>
          </div>
          <div v-if="link.title" class="seo-resource-property">
            <dt>title</dt><dd>{{ link.title }}</dd>
          </div>
          <div v-if="link.href !== link.url" class="seo-resource-property">
            <dt>原始地址</dt><dd class="seo-resource-original">
              {{ link.href ?? '无 href 属性' }}
            </dd>
          </div>
        </dl>
      </article>
    </div>
    <div v-else class="seo-images-grid">
      <article v-for="(image, index) in filteredImages.slice(0, limit)" :key="image.id" class="seo-item seo-resource-card seo-image-item">
        <header class="seo-resource-heading">
          <span class="seo-resource-number">{{ index + 1 }}</span>
          <div class="seo-resource-heading-content">
            <h5 class="seo-resource-title">
              {{ imageName(image, index) }}
            </h5>
            <div class="seo-resource-meta">
              <span class="seo-chip" :data-alt="image.alt === null ? 'missing' : image.alt.trim() ? 'text' : 'empty'">{{ image.alt === null ? '未设置 alt' : image.alt.trim() ? 'alt 已填写' : 'alt 为空' }}</span>
              <span v-if="image.truncated" class="seo-chip">已截断</span>
            </div>
          </div>
          <UiActionButton icon-only size="sm" label="复制图片地址" :disabled="!(image.url || image.src || '').trim()" @click="emit('copy', image.url || image.src || '')">
            <Copy :size="16" aria-hidden="true" />
          </UiActionButton>
        </header>
        <div class="seo-image-body">
          <SeoImagePreview :src="image.url" :label="imageName(image, index)" />
          <dl class="seo-resource-details">
            <div class="seo-resource-property">
              <dt>尺寸</dt><dd class="seo-image-dimensions">
                {{ image.width || '未知' }} × {{ image.height || '未知' }}
              </dd>
            </div>
            <div class="seo-resource-property">
              <dt>alt 文本</dt><dd :class="{ 'seo-muted': !image.alt?.trim() }">
                {{ image.alt === null ? '无 alt 属性' : image.alt.trim() ? image.alt : '空 alt（可能为装饰性图片）' }}
              </dd>
            </div>
            <div v-if="image.title" class="seo-resource-property">
              <dt>title</dt><dd>{{ image.title }}</dd>
            </div>
          </dl>
        </div>
        <div class="seo-resource-address">
          <span class="seo-resource-label">图片地址</span>
          <SeoUrl class="seo-resource-url" :value="image.url || image.src || ''" />
        </div>
        <dl v-if="image.src !== image.url" class="seo-resource-details seo-image-original">
          <div class="seo-resource-property">
            <dt>原始地址</dt><dd class="seo-resource-original">
              {{ image.src ?? '无 src 属性' }}
            </dd>
          </div>
        </dl>
      </article>
    </div>
    <UiEmptyState v-if="!total">
      当前筛选下没有匹配项。
    </UiEmptyState>
    <UiActionButton v-if="total > limit" size="sm" @click="limit += 50">
      再显示 50 项
    </UiActionButton>
  </div>
</template>
