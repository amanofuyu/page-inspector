<script setup lang="ts">
import type { MeshGradientRenderer } from '../mesh-gradient'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const host = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const ready = ref(false)
const moving = ref(false)
let cleanup = () => {}

onMounted(() => {
  const element = host.value!
  const surface = canvas.value!
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const transparency = window.matchMedia('(prefers-reduced-transparency: reduce)')
  let renderer: MeshGradientRenderer | null = null
  let create: typeof import('../mesh-gradient').createMeshGradientRenderer | undefined
  let disposed = false
  let attempted = false
  let frame = 0
  let previous: number | null = null
  let lastPaint = 0
  let time = 4

  function stop() {
    cancelAnimationFrame(frame)
    frame = 0
    previous = null
  }
  function release() {
    stop()
    ready.value = false
    renderer?.dispose()
    renderer = null
  }
  function tick(now: number) {
    frame = 0
    if (disposed || !renderer || !moving.value)
      return
    if (previous !== null)
      time += Math.min((now - previous) / 1000, 0.1)
    previous = now
    // 背景最多绘制 30 帧，隐藏后恢复时不补算离开的时间。
    if (now - lastPaint >= 1000 / 30) {
      if (!renderer.draw(time)) {
        release()
        return
      }
      lastPaint = now
    }
    frame = requestAnimationFrame(tick)
  }
  function sync() {
    stop()
    if (disposed)
      return
    moving.value = !document.hidden && !motion.matches && !transparency.matches
    if (document.hidden || transparency.matches)
      return
    try {
      if (!renderer && create && !attempted) {
        attempted = true
        renderer = create(surface)
      }
      if (!renderer)
        return
      const { width, height } = element.getBoundingClientRect()
      renderer.resize(width, height, window.devicePixelRatio || 1)
      renderer.setPalette(getComputedStyle(document.documentElement))
      ready.value = renderer.draw(time)
      if (!ready.value) {
        release()
        return
      }
      if (moving.value)
        frame = requestAnimationFrame(tick)
    }
    catch {
      release()
    }
  }
  function contextLost(event: Event) {
    event.preventDefault()
    release()
  }
  function contextRestored() {
    attempted = false
    sync()
  }

  const resizeObserver = new ResizeObserver(sync)
  const themeObserver = new MutationObserver(sync)
  resizeObserver.observe(element)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
  motion.addEventListener('change', sync)
  transparency.addEventListener('change', sync)
  document.addEventListener('visibilitychange', sync)
  surface.addEventListener('webglcontextlost', contextLost)
  surface.addEventListener('webglcontextrestored', contextRestored)
  sync()
  void import('../mesh-gradient').then((module) => {
    if (disposed)
      return
    create = module.createMeshGradientRenderer
    sync()
  }).catch(() => {
    if (!disposed)
      release()
  })

  cleanup = () => {
    disposed = true
    resizeObserver.disconnect()
    themeObserver.disconnect()
    motion.removeEventListener('change', sync)
    transparency.removeEventListener('change', sync)
    document.removeEventListener('visibilitychange', sync)
    surface.removeEventListener('webglcontextlost', contextLost)
    surface.removeEventListener('webglcontextrestored', contextRestored)
    release()
  }
})
onBeforeUnmount(() => cleanup())
</script>

<template>
  <div ref="host" class="inspector-ambience" :data-renderer="ready ? 'webgl' : 'css'" :data-motion="moving ? 'running' : 'paused'" aria-hidden="true">
    <div class="ambient-fallback">
      <span class="ambient-glow" />
      <span class="ambient-glow ambient-glow-secondary" />
    </div>
    <canvas ref="canvas" class="ambient-mesh" />
  </div>
</template>
