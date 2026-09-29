<script setup lang="ts">
import UiTabList from '@/components/ui/UiTabList.vue'

defineProps<{ status: string, statusLabel: string, captureTime: string, contextOpen: boolean, renderLabel: string, totalBytes: number, sourceCount?: number }>()
const emit = defineEmits<{ context: [] }>()
function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`
}
</script>

<template>
  <footer class="workspace-footer">
    <div class="app-footer">
      <span class="capture-status" :data-status="status" role="status"><span class="status-dot" aria-hidden="true" />{{ statusLabel }}</span>
      <span v-if="captureTime" class="capture-time">{{ captureTime }}</span>
      <button v-if="sourceCount !== undefined" class="footer-source" :aria-expanded="contextOpen" aria-haspopup="dialog" aria-controls="page-context" :title="renderLabel" @click="emit('context')">
        {{ size(totalBytes) }} · {{ sourceCount }} 来源
      </button>
    </div>
    <UiTabList label="工作区" variant="workspace" />
  </footer>
</template>
