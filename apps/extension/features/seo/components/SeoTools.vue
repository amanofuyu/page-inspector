<script setup lang="ts">
import { computed, ref } from 'vue'
import UiSearchInput from '@/components/ui/UiSearchInput.vue'
import { seoSearch, seoToolLinks } from '../tools'
import SeoUrl from './SeoUrl.vue'

const props = defineProps<{ url: string }>()
const links = computed(() => seoToolLinks(props.url))
const groups = computed(() => [
  { key: 'page', label: '页面验证', description: '查看性能和富媒体结果。' },
  { key: 'research', label: '链接与流量', description: '查看外链和站点流量数据。' },
  { key: 'search', label: '搜索收录', description: '通过搜索引擎查看站内收录地址。' },
  { key: 'site', label: '站点资料', description: '查看历史快照和域名信息。' },
].map(group => ({ ...group, links: links.value.filter(link => link.group === group.key) })))
const hostname = computed(() => new URL(props.url).hostname)
const text = ref('')
const quoted = computed(() => `"${text.value.trim().replaceAll('"', '')}"`)
</script>

<template>
  <div class="seo-tools">
    <p class="feature-caption">
      点击后在新标签页打开外部服务，并将页面地址交给该服务；结果与登录要求由服务提供。
    </p>
    <div class="seo-tool-groups">
      <section v-for="group in groups" :key="group.key" class="seo-block" :aria-label="group.label">
        <h4>{{ group.label }}</h4>
        <p class="feature-caption">
          {{ group.description }}
        </p>
        <ul class="seo-tool-list">
          <li v-for="link in group.links" :key="link.label">
            <SeoUrl :value="link.url">
              {{ link.label }}
            </SeoUrl>
            <span aria-hidden="true">↗</span>
          </li>
        </ul>
      </section>
    </div>
    <section class="seo-block seo-text-search" aria-label="查找重复文本">
      <h4>查找重复文本</h4>
      <p class="feature-caption">
        输入文本，查看全网或当前站点中的相同内容。
      </p>
      <UiSearchInput v-model="text" label="待查找的文本" placeholder="输入需要查找的文本" />
      <div v-if="text.trim()" class="seo-actions">
        <SeoUrl :value="seoSearch(quoted)">
          全网查找
        </SeoUrl><SeoUrl :value="seoSearch(`site:${hostname} ${quoted}`)">
          站内查找
        </SeoUrl>
      </div>
    </section>
  </div>
</template>
