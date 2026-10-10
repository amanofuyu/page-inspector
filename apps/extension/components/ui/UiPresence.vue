<script setup lang="ts">
withDefaults(defineProps<{ preset?: 'expand' | 'toast' | 'fade' | 'dropdown' }>(), { preset: 'expand' })
</script>

<template>
  <Transition :name="`ui-${preset}`">
    <slot />
  </Transition>
</template>

<style>
.ui-expand-enter-active,
.ui-expand-leave-active,
.ui-toast-enter-active,
.ui-toast-leave-active,
.ui-fade-enter-active,
.ui-fade-leave-active,
.ui-dropdown-enter-active,
.ui-dropdown-leave-active {
  transition: opacity 120ms ease;
}
.ui-expand-enter-from,
.ui-expand-leave-to,
.ui-toast-enter-from,
.ui-toast-leave-to,
.ui-fade-enter-from,
.ui-fade-leave-to,
.ui-dropdown-enter-from,
.ui-dropdown-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .ui-expand-enter-active,
  .ui-expand-leave-active,
  .ui-toast-enter-active,
  .ui-toast-leave-active,
  .ui-fade-enter-active,
  .ui-fade-leave-active,
  .ui-dropdown-enter-active,
  .ui-dropdown-leave-active {
    transition: none;
  }
}
</style>
