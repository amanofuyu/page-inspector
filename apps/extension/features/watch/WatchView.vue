<script setup lang="ts">
import type { FieldPath } from '../inspection/model'
import type { WatchDraft } from '../inspector/useWorkbenchViewState'
import type { Scope, WatchComparison, WatchRule } from './model'
import { computed } from 'vue'
import UiActionButton from '@/components/ui/UiActionButton.vue'
import UiCheckbox from '@/components/ui/UiCheckbox.vue'
import UiDisclosure from '@/components/ui/UiDisclosure.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiNotice from '@/components/ui/UiNotice.vue'
import { formatPath } from '../query/path'

const props = defineProps<{
  draft: WatchDraft
  scope: Scope | null
  watches: WatchRule[]
  otherWatches: WatchRule[]
  comparisons: WatchComparison[]
}>()
const emit = defineEmits<{
  'update:draft': [value: WatchDraft]
  'add': []
  'rename': [id: string, name: string]
  'locate': [path: FieldPath]
  'remove': [id: string]
}>()
const comparisonsById = computed(() => new Map(props.comparisons.map(value => [value.id, value])))
function comparison(id: string) {
  return comparisonsById.value.get(id)
}
function patch(value: Partial<WatchDraft>) {
  emit('update:draft', { ...props.draft, ...value })
}
</script>

<template>
  <div class="feature-heading">
    <h2>字段关注</h2><span>{{ watches.length }} / 50</span>
  </div>
  <p class="feature-caption">
    仅比较相邻成功采集的初始 payload。基线只留在当前面板会话，关闭面板后清除。数组、Map 和 Set 按位置关注，重新排序会改变目标。
  </p>
  <UiNotice v-if="!scope" severity="warning">
    初始文档或唯一应用声明标识不可确认，请选择有唯一标识的应用后添加关注。
  </UiNotice>
  <p v-else class="feature-caption break-text">
    范围：{{ scope.origin }}{{ scope.pathname }} · 应用 {{ scope.app }}
  </p>
  <UiCheckbox :model-value="draft.includeQuery" @update:model-value="patch({ includeQuery: $event })">
    新规则的作用域包含 URL 查询参数
  </UiCheckbox>
  <div class="watch-editor">
    <UiInput :model-value="draft.path" label="关注路径" placeholder="$[&quot;data&quot;][&quot;products&quot;][0]" @update:model-value="patch({ path: $event })" /><UiInput :model-value="draft.name" label="关注别名" placeholder="别名（可选）" @update:model-value="patch({ name: $event })" /><UiActionButton :disabled="!scope" size="sm" variant="primary" @click="emit('add')">
      添加关注
    </UiActionButton>
  </div>
  <article v-for="rule in watches" :key="rule.id" class="watch-row">
    <div class="feature-toolbar">
      <UiInput :model-value="rule.name" :label="`重命名关注 ${rule.name}`" @change="emit('rename', rule.id, $event)" /><strong class="watch-status">{{ comparison(rule.id)?.status || '等待比较' }}</strong>
    </div><button class="path-button mono" @click="emit('locate', rule.path)">
      {{ formatPath(rule.path) }}
    </button><p>当前：{{ comparison(rule.id)?.current.preview ?? '等待成功采集' }}</p><p class="feature-caption">
      上次：{{ comparison(rule.id)?.previous?.preview ?? '暂无基线' }} · {{ comparison(rule.id)?.current.type }}
    </p><p v-if="comparison(rule.id)?.current.reason" class="feature-caption">
      {{ comparison(rule.id)?.current.reason }}
    </p><UiActionButton @click="emit('remove', rule.id)">
      取消关注
    </UiActionButton>
  </article>
  <UiEmptyState v-if="!watches.length">
    在字段、排名或查询结果中点击“关注”，也可以输入精确路径。
  </UiEmptyState>
  <UiDisclosure v-if="otherWatches.length" class="disclosure-section">
    <template #label>
      <span>页面范围不匹配 · {{ otherWatches.length }} 项</span>
    </template><div v-for="rule in otherWatches" :key="rule.id" class="favorite-row">
      <span>{{ rule.name }} · {{ rule.scope.pathname }} · {{ rule.scope.app }}</span><UiActionButton @click="emit('remove', rule.id)">
        删除
      </UiActionButton>
    </div>
  </UiDisclosure>
</template>
