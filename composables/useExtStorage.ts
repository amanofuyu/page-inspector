import { tryOnUnmounted } from '@vueuse/core'

export type ExtStorageType = 'local' | 'sync' | 'managed'

export function useExtStorage<T = any>(key: `${ExtStorageType}:${string}`, defaultValue: T | null = null) {
  const value = shallowRef<T | null>(defaultValue)

  const item = storage.defineItem<T>(key)

  item.getValue().then((res) => {
    if (res) {
      value.value = res as T
    }
    else {
      setValue(defaultValue)
    }
  })

  const unwatch = item.watch((res) => {
    value.value = res as T
  })

  function setValue(val: T | null) {
    const oldValue = value.value

    value.value = val

    item.setValue(val).catch(() => {
      value.value = oldValue
    })
  }

  tryOnUnmounted(() => {
    unwatch()
  })

  return computed<T | null>({
    get: () => value.value,
    set: setValue,
  })
}
