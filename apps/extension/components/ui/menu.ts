import type { Component } from 'vue'

export interface UiMenuItem<T extends string = string> {
  value: T
  label: string
  icon?: Component
  disabled?: boolean
  separatorBefore?: boolean
}
