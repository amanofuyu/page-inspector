import type { Component } from 'vue'

export type UiSelectValue = string | number | null

export interface UiSelectItem<T extends UiSelectValue = UiSelectValue> {
  value: T
  label: string
  icon?: Component
  disabled?: boolean
}

// 区分数字、字符串与空值，避免来源索引和“合并应用”在选择后被转成字符串。
export function selectItemKey(value: UiSelectValue) {
  return `${typeof value}:${String(value)}`
}
