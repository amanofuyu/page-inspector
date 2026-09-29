import type { SidePanel } from './fixtures'
import { expect, test } from './fixtures'

async function press(panel: SidePanel, key: string, code: string, keyCode: number) {
  const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined
  await panel.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, text, unmodifiedText: text })
  await panel.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode })
}

test('公共页签的键盘激活、面板关联与 Tooltip 焦点交互', async ({ extension }) => {
  const { panel } = extension
  await panel.evaluate(() => document.querySelector<HTMLButtonElement>('.data-card [role="tab"][data-value="data"]')!.focus())
  await press(panel, 'ArrowRight', 'ArrowRight', 39)
  await expect.poll(() => panel.evaluate(() => document.activeElement?.getAttribute('data-value'))).toBe('state')
  expect(await panel.evaluate(() => document.querySelector('.data-card [aria-selected="true"]')?.getAttribute('data-value'))).toBe('data')
  await press(panel, 'Enter', 'Enter', 13)
  await expect.poll(() => panel.evaluate(() => document.querySelector('.data-card [aria-selected="true"]')?.getAttribute('data-value'))).toBe('state')
  expect(await panel.evaluate(() => {
    const trigger = document.querySelector('.data-card [aria-selected="true"]')!
    const content = document.getElementById(trigger.getAttribute('aria-controls')!)!
    return content.getAttribute('role') === 'tabpanel' && content.getAttribute('aria-labelledby') === trigger.id
  })).toBe(true)
  await press(panel, 'Home', 'Home', 36)
  await expect.poll(() => panel.evaluate(() => document.activeElement?.getAttribute('data-value'))).toBe('data')
  await press(panel, ' ', 'Space', 32)
  await expect.poll(() => panel.evaluate(() => document.querySelector('.data-card [aria-selected="true"]')?.getAttribute('data-value'))).toBe('data')
  await panel.evaluate(() => document.querySelector<HTMLButtonElement>('.workspace-tabs [data-value="data"]')!.focus())
  await press(panel, 'End', 'End', 35)
  await expect.poll(() => panel.evaluate(() => document.activeElement?.getAttribute('data-value'))).toBe('seo')
  expect(await panel.evaluate(() => document.querySelector('.workspace-tabs [aria-selected="true"]')?.getAttribute('data-value'))).toBe('data')
  await press(panel, 'Enter', 'Enter', 13)
  await expect.poll(() => panel.evaluate(() => document.querySelector('.workspace-tabs [aria-selected="true"]')?.getAttribute('data-value'))).toBe('seo')

  await panel.evaluate(() => document.querySelector<HTMLButtonElement>('[aria-label="页面与数据来源"]')!.focus())
  await expect.poll(() => panel.evaluate(() => document.querySelector('[role="tooltip"]')?.textContent?.trim())).toBe('页面与数据来源')
  await press(panel, 'Escape', 'Escape', 27)
  await expect.poll(() => panel.evaluate(() => document.querySelector('[role="tooltip"]'))).toBeNull()
  expect(await panel.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('页面与数据来源')
  expect(panel.exceptions).toEqual([])
})
