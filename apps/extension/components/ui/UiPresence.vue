<script setup lang="ts">
import type { DOMKeyframesDefinition } from 'motion-v'
import type { UiAnimation } from '@/libs/motion'
import { onBeforeUnmount } from 'vue'
import { animateUi, motionDuration } from '@/libs/motion'

const props = withDefaults(defineProps<{ preset?: 'expand' | 'toast' | 'fade' | 'dropdown' }>(), { preset: 'expand' })
const animations = new Map<HTMLElement, UiAnimation>()

function cancel(element: Element) {
  const target = element as HTMLElement
  animations.get(target)?.cancel()
  animations.delete(target)
  target.removeAttribute('inert')
  target.removeAttribute('data-motion-presence')
}

function run(element: Element, done: () => void, entering: boolean) {
  const target = element as HTMLElement
  cancel(target)
  target.toggleAttribute('inert', !entering)
  target.setAttribute('data-motion-presence', entering ? 'enter' : 'leave')
  const keyframes: DOMKeyframesDefinition = { opacity: entering ? [0, 1] : [1, 0] }
  if (props.preset === 'expand') {
    const styles = getComputedStyle(target)
    for (const key of ['height', 'paddingTop', 'paddingBottom', 'marginTop', 'marginBottom', 'borderTopWidth', 'borderBottomWidth'] as const)
      keyframes[key] = entering ? ['0px', styles[key]] : [styles[key], '0px']
  }
  else if (props.preset === 'toast') {
    keyframes.transform = entering ? ['translateY(10px) scale(0.98)', 'translateY(0px) scale(1)'] : ['translateY(0px) scale(1)', 'translateY(6px) scale(0.98)']
  }
  else if (props.preset === 'dropdown') {
    keyframes.transform = entering ? ['scale(0.97)', 'scale(1)'] : ['scale(1)', 'scale(0.98)']
  }
  let completed = false
  const animation = animateUi(target, keyframes, {
    duration: props.preset === 'expand' ? motionDuration.resize : entering ? motionDuration.enter : motionDuration.feedback,
    styles: props.preset === 'expand' ? { 'overflow': 'clip', 'min-height': '0' } : undefined,
    onComplete() {
      completed = true
      animations.delete(target)
      target.removeAttribute('data-motion-presence')
      done()
    },
  })
  if (!completed)
    animations.set(target, animation)
}

onBeforeUnmount(() => {
  for (const element of animations.keys())
    cancel(element)
})
</script>

<template>
  <Transition :css="false" @enter="(element, done) => run(element, done, true)" @leave="(element, done) => run(element, done, false)" @enter-cancelled="cancel" @leave-cancelled="cancel" @after-leave="cancel">
    <slot />
  </Transition>
</template>
