<script setup lang="ts">
import type { SeoField } from '../model'
import { computed } from 'vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import UiDisclosure from '@/components/ui/UiDisclosure.vue'
import UiJsonCode from '@/components/ui/UiJsonCode.vue'
import UiNotice from '@/components/ui/UiNotice.vue'
import { seoFieldPreview } from '../preview'

const props = defineProps<{ field: SeoField, source: 'DOM' | 'HTML', open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean], 'copy': [text: string] }>()
const preview = computed(() => seoFieldPreview(props.field))
const summary = computed(() => props.field.group === 'structured' ? preview.value.text.split('\n').slice(0, 8).join('\n').slice(0, 240) : props.field.value.slice(0, 240))
</script>

<template>
  <UiDisclosure :open="open" class="seo-row" :data-key="field.key" @update:open="emit('update:open', $event)">
    <template #label>
      <strong :class="{ 'seo-heading-level': field.group === 'headings' }">{{ field.label }}</strong>
      <span class="seo-badge">{{ field.value.length.toLocaleString() }} 字符{{ field.truncated ? ' · 已截断' : '' }}</span>
    </template>
    <template #preview>
      <div v-if="field.key !== 'jsonld'" class="seo-values seo-single">
        <p :class="{ 'seo-json-preview': field.group === 'structured' }">
          {{ summary || '（空值）' }}
        </p>
      </div>
    </template>
    <div class="seo-field-detail">
      <div class="seo-field-detail-heading">
        <span class="seo-field-meta">{{ source }} · {{ field.location }} · {{ field.value.length.toLocaleString() }} 字符</span>
        <div class="seo-field-actions">
          <UiActionButton v-if="field.key === 'jsonld'" :label="`复制 ${source} JSON-LD 原文`" @click="emit('copy', field.value)">
            复制 JSON
          </UiActionButton>
          <UiActionButton :label="`复制 ${source} ${field.label}`" @click="emit('copy', field.snippet)">
            {{ field.key === 'microdata' ? '复制数据 JSON' : '复制标签' }}
          </UiActionButton>
        </div>
      </div>
      <UiNotice v-if="field.truncated" severity="warning">
        该字段达到读取上限，以下为已采集部分。
      </UiNotice>
      <UiNotice v-if="field.jsonError" severity="warning">
        JSON 无法解析：{{ field.jsonError }}
      </UiNotice>
      <UiJsonCode v-if="field.key === 'jsonld'" :code="preview.text" :label="`${source} ${field.label} 内容`" />
      <pre v-else>{{ preview.text }}</pre>
      <p v-if="preview.truncated" class="feature-caption">
        仅预览前 16,000 字符；复制保留完整已采集内容。
      </p>
      <UiActionButton v-if="field.key !== 'jsonld'" @click="emit('copy', field.value)">
        复制字段值
      </UiActionButton>
    </div>
  </UiDisclosure>
</template>
