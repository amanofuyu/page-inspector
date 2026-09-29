import { Buffer } from 'node:buffer'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { clickText, expect, fillField, test } from './fixtures'

test.use({
  targetUrl: 'http://127.0.0.1:4318/seo',
  expectedText: '未检测到 Nuxt 数据',
})
test('普通页面 SEO：未知来源、参考 HTML、字段筛选、就地详情与报告', async ({
  extension,
}, testInfo) => {
  const { panel, downloads, website } = extension
  await clickText(panel, 'SEO', '.workspace-tabs')
  const title = '[data-key="title"]'
  await expect
    .poll(() =>
      panel.evaluate(() =>
        document
          .querySelector('[data-key="title"]')
          ?.getAttribute('data-change'),
      ),
    )
    .toBe('unknown')
  expect(
    await panel.evaluate(() =>
      [...document.querySelectorAll('[data-key^="heading:"]')].map(row =>
        row.getAttribute('data-key'),
      ),
    ),
  ).toEqual(['heading:h1'])
  expect(
    await panel.evaluate(() => document.querySelector('.empty-state')),
  ).toBeNull()
  expect(
    await panel.evaluate(
      () => document.querySelector('.seo-summary')?.textContent,
    ),
  ).toContain('DOM 字段')
  await panel.click(`${title} > .seo-row-toggle`)
  await expect
    .poll(() =>
      panel.evaluate(
        () => document.querySelector('.seo-field-detail')?.textContent,
      ),
    )
    .toContain('SEO 客户端标题')
  await panel.click('[aria-label="复制 DOM title"]')
  await expect
    .poll(() =>
      panel.evaluate(
        () => document.querySelector('.toast-message')?.textContent,
      ),
    )
    .toContain('已复制 SEO')
  await clickText(panel, '读取参考 HTML')
  await expect
    .poll(() =>
      panel.evaluate(() =>
        document
          .querySelector('[data-key="title"]')
          ?.getAttribute('data-change'),
      ),
    )
    .toBe('reference')
  expect(
    await panel.evaluate(
      () => document.querySelector('.seo-source > summary')?.textContent,
    ),
  ).toContain('参考 HTML')
  expect(
    await panel.evaluate(
      () => document.querySelectorAll('[data-change="changed"]').length,
    ),
  ).toBe(0)
  await panel.select('[aria-label="SEO 来源状态"]', 'differences')
  await fillField(panel, '[aria-label="搜索 SEO 字段"]', 'description')
  await expect
    .poll(() =>
      panel.evaluate(() => document.querySelectorAll('.seo-row').length),
    )
    .toBe(1)
  expect(
    await panel.evaluate(
      () => document.querySelector('.seo-values')?.textContent,
    ),
  ).toContain('服务端描述')
  expect(
    await panel.evaluate(
      () => document.querySelector('.seo-values')?.textContent,
    ),
  ).toContain('客户端描述')
  await panel.send('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await panel.click('[data-key="meta:description"] > .seo-row-toggle')
  await panel.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .map(animation => animation.finished.catch(() => {})),
    )
  })
  expect(
    await panel.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  const screenshot = await panel.send<{ data: string }>(
    'Page.captureScreenshot',
    { format: 'png' },
  )
  await writeFile(
    testInfo.outputPath('seo-narrow.png'),
    Buffer.from(screenshot.data, 'base64'),
  )
  await panel.select('[aria-label="界面主题"]', 'dark')
  await panel.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .map(animation => animation.finished.catch(() => {})),
    )
  })
  const dark = await panel.send<{ data: string }>('Page.captureScreenshot', {
    format: 'png',
  })
  await writeFile(
    testInfo.outputPath('seo-narrow-dark.png'),
    Buffer.from(dark.data, 'base64'),
  )
  await clickText(panel, '问题', '.seo-tabs')
  await expect
    .poll(() =>
      panel.evaluate(() => document.querySelector('.seo-card')?.textContent),
    )
    .toContain('参考 HTML 含 noindex')
  await clickText(panel, '导出 JSON', '.seo-card')
  await expect
    .poll(
      async () =>
        (await readdir(downloads)).filter(name => name.endsWith('.json')).length,
    )
    .toBe(1)
  const report = JSON.parse(
    await readFile(
      path.join(downloads, (await readdir(downloads))[0]!),
      'utf8',
    ),
  )
  expect(report.format).toBe('page-inspector-seo/v1')
  expect(report.html.source).toBe('refetch-reference')
  expect(report.dom.source).toBe('live-dom')
  for (const snapshot of [report.dom, report.html]) {
    expect(
      snapshot.fields
        .filter((field: { group: string }) => field.group === 'headings')
        .map((field: { key: string }) => field.key),
    ).toEqual(['heading:h1'])
  }
  expect(
    report.rows.some(
      (row: { key: string, change: string }) =>
        row.key === 'title' && row.change === 'reference',
    ),
  ).toBe(true)
  await website.evaluate(() => history.pushState({}, '', '/seo-next'))
  await expect
    .poll(() =>
      panel.evaluate(
        () => document.querySelector('.seo-source > summary')?.textContent,
      ),
    )
    .toContain('尚未捕获')
})

test('SEO 空值、多值与缺失筛选保留实际证据', async ({ extension }) => {
  const { website, panel } = extension
  await website.evaluate(() => {
    document.querySelector('link[rel="canonical"]')!.remove()
    document
      .querySelector('meta[name="description"]')!
      .setAttribute('content', '')
    const duplicate = document.createElement('meta')
    duplicate.name = 'description'
    duplicate.content = '第二个描述'
    document.head.append(duplicate)
  })
  await clickText(panel, 'SEO', '.workspace-tabs')
  await expect
    .poll(() =>
      panel.evaluate(
        () => document.querySelectorAll('[data-key="meta:description"]').length,
      ),
    )
    .toBe(2)
  await panel.select('[aria-label="SEO 字段情况"]', 'empty')
  expect(
    await panel.evaluate(() =>
      [...document.querySelectorAll('.seo-row')].map(row =>
        row.getAttribute('data-key'),
      ),
    ),
  ).toEqual(['meta:description'])
  await panel.select('[aria-label="SEO 字段情况"]', 'multiple')
  expect(
    await panel.evaluate(
      () => document.querySelectorAll('[data-key="meta:description"]').length,
    ),
  ).toBe(2)
  await panel.select('[aria-label="SEO 字段情况"]', 'missing')
  expect(
    await panel.evaluate(() => document.querySelectorAll('.seo-row').length),
  ).toBe(1)
  expect(
    await panel.evaluate(
      () => document.querySelector('[data-key="link:canonical"]')?.textContent,
    ),
  ).toContain('未发现')
  expect(
    await panel.evaluate(() =>
      document
        .querySelector('[data-key="link:canonical"]')
        ?.getAttribute('data-change'),
    ),
  ).toBe('unknown')
  await clickText(panel, '问题', '.seo-tabs')
  expect(
    await panel.evaluate(
      () => document.querySelector('.seo-card')?.textContent,
    ),
  ).toContain('description 重复定义')
})
