<script setup lang="ts">
// 离场内容仍参与布局缓动，但立即退出鼠标与键盘交互。
function leave(element: Element) {
  element.setAttribute('inert', '')
}
function restore(element: Element) {
  element.removeAttribute('inert')
}
</script>

<template>
  <Transition name="expand" @before-leave="leave" @after-leave="restore" @leave-cancelled="restore">
    <slot />
  </Transition>
</template>
