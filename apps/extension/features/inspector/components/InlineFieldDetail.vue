<script setup lang="ts">
import type { FieldPath } from '../../inspection/model'
import type { FieldDetailData } from '../useFieldDetails'
import type { ToastInput } from '@/composables/useToast'
import ExpandTransition from '../ExpandTransition.vue'
import FieldDetailPanel from '../FieldDetailPanel.vue'

defineProps<{ id: string, location: string, selected: string | null, data: FieldDetailData }>()
const emit = defineEmits<{
  close: []
  notice: [notice: ToastInput]
  watch: [path: FieldPath]
  locate: [path: FieldPath, location: string]
}>()
</script>

<template>
  <ExpandTransition>
    <FieldDetailPanel v-if="selected === location" :id="id" class="inline-field-detail" v-bind="data" @close="emit('close')" @notice="emit('notice', $event)" @watch="emit('watch', $event)" @locate="emit('locate', $event, location)" />
  </ExpandTransition>
</template>
