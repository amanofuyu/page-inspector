<script setup lang="ts">
import type { SeoField, SeoRow } from '../model'
import type { SeoDisplay } from '../useSeoViewState'
import { Copy } from '@lucide/vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import UiDisclosure from '@/components/ui/UiDisclosure.vue'
import { CHANGES, GROUPS } from '../model'
import { seoFieldPreview } from '../preview'

defineProps<{ row: SeoRow, display: SeoDisplay, open: boolean, domComplete: boolean, htmlComplete?: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean], 'copy': [text: string] }>()
const previewCache = new WeakMap<SeoField, ReturnType<typeof seoFieldPreview>>()
function preview(field: SeoField) {
  let result = previewCache.get(field)
  if (!result) {
    result = seoFieldPreview(field)
    previewCache.set(field, result)
  }
  return result
}
function summary(field?: SeoField) {
  if (!field)
    return ''
  if (field.group !== 'structured')
    return field.value.slice(0, 240)
  const result = preview(field)
  const text = result.text.split('\n').slice(0, 8).join('\n').slice(0, 240)
  return text + (text.length < result.text.length || result.truncated ? '…' : '')
}
</script>

<template>
  <UiDisclosure
    :open="open" class="seo-row"
    :data-key="row.key"
    :data-change="row.change"
    @update:open="emit('update:open', $event)"
  >
    <template #label>
      <strong>{{ row.label }}</strong><span class="seo-badge">{{ CHANGES[row.change] }}</span>
    </template>
    <template #preview>
      <div
        class="seo-values"
        :class="{ 'seo-single': display !== 'compare' }"
      >
        <div v-if="display !== 'dom'">
          <small>HTML</small>
          <p :class="{ 'seo-json-preview': row.group === 'structured' }">
            {{
              summary(row.html)
                || (row.html ? '（空值）' : htmlComplete ? '未发现' : '未确认')
            }}
          </p>
        </div>
        <div v-if="display !== 'html'">
          <small>DOM</small>
          <p :class="{ 'seo-json-preview': row.group === 'structured' }">
            {{
              row.group === 'transport'
                ? '仅来自 HTTP 响应'
                : summary(row.dom)
                  || (row.dom
                    ? '（空值）'
                    : domComplete
                      ? '未发现'
                      : '未确认')
            }}
          </p>
        </div>
      </div>
    </template>
    <div class="seo-field-detail">
      <p v-if="row.group === 'headings'">
        仅展示 H1，按其在文档中的顺序比较，不追踪 DOM 节点身份。
      </p>
      <p>
        {{ GROUPS[row.group] }} · {{ CHANGES[row.change]
        }}<span v-if="row.change === 'reference'">
          · 本次重新请求与 DOM 的参考对比</span>
      </p>
      <template
        v-for="(field, key) in { HTML: row.html, DOM: row.dom }"
        :key="key"
      >
        <div v-if="field">
          <div class="feature-heading">
            <strong>{{ key }} · {{ field.location }} ·
              {{ field.value.length.toLocaleString() }} 字符</strong><UiActionButton

              :label="`复制 ${key} ${row.label}`"
              @click="emit('copy', field.snippet)"
            >
              <Copy :size="13" aria-hidden="true" />复制标签
            </UiActionButton>
          </div>
          <p v-if="field.truncated" class="notice notice-warning">
            该字段达到读取或结构比较上限，无法确认完整差异。
          </p>
          <p v-if="field.jsonError" class="notice notice-error">
            {{ field.jsonError }}
          </p>
          <pre>{{ preview(field).text }}</pre>
          <p
            v-if="preview(field).truncated"
            class="feature-caption"
          >
            仅预览前 16,000 字符；复制和导出包含完整已采集内容。
          </p>
        </div>
      </template>
      <UiActionButton

        @click="emit('copy', JSON.stringify(row, null, 2))"
      >
        复制字段对比
      </UiActionButton>
    </div>
  </UiDisclosure>
</template>
