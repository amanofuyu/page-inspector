import type { Component, ComputedRef, InjectionKey } from 'vue'
import { inject } from 'vue'

export interface UiTabItem<T extends string = string> {
  id: T
  label: string
  icon?: Component
  disabled?: boolean
}

export const tabsItemsKey: InjectionKey<ComputedRef<readonly UiTabItem[]>> = Symbol('ui-tabs-items')

export function useTabItems() {
  const items = inject(tabsItemsKey)
  if (!items)
    throw new Error('UiTabList 必须放在 UiTabs 内。')
  return items
}
