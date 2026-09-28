import { computed, onUnmounted, shallowRef } from 'vue'
import { storage } from 'wxt/utils/storage'

export type ExtStorageType = 'local' | 'sync' | 'managed'
export function useExtStorage<T>(key: `${ExtStorageType}:${string}`, defaultValue: T) {
  const value = shallowRef<T>(defaultValue)
  const item = storage.defineItem<T>(key)
  let revision = 0
  let disposed = false
  const initialRevision = revision
  void item.getValue().then((stored) => {
    if (!disposed && revision === initialRevision)
      value.value = stored ?? defaultValue
  }).catch(() => { })
  const unwatch = item.watch((stored) => {
    revision++
    value.value = stored ?? defaultValue
  })
  let writes = Promise.resolve()
  function setValue(next: T) {
    const previous = value.value
    const ticket = ++revision
    value.value = next
    writes = writes.then(() => item.setValue(next)).catch(() => {
      if (revision === ticket)
        value.value = previous
    })
  }
  onUnmounted(() => {
    disposed = true
    unwatch()
  })
  return computed<T>({ get: () => value.value, set: setValue })
}
