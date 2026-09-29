import type { Component, ComputedRef, InjectionKey } from 'vue'
import { inject } from 'vue'

export interface UiTabItem<T extends string = string> {
  id: T
  label: string
  icon?: Component
  disabled?: boolean
}

export const tabsItemsKey: InjectionKey<ComputedRef<readonly UiTabItem[]>> = Symbol('ui-tabs-items')
export const tabsValueKey: InjectionKey<ComputedRef<string>> = Symbol('ui-tabs-value')

export function useTabValue() {
  const value = inject(tabsValueKey)
  if (!value)
    throw new Error('页签组件必须放在 UiTabs 内。')
  return value
}

export function useTabItems() {
  const items = inject(tabsItemsKey)
  if (!items)
    throw new Error('UiTabList 必须放在 UiTabs 内。')
  return items
}
