import antfu from '@antfu/eslint-config'

export default antfu(
  {
    formatters: true,
    vue: true,
  },
  {
    ignores: ['**/.wxt/**', '**/.nuxt/**', '**/.output/**', '**/public/**', '**/test-results/**', '**/playwright-report/**', '.artifacts/**'],
  },
  {
    files: ['apps/extension/features/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['@ark-ui/*'], message: '业务模块通过 components/ui 使用统一交互组件，不直接定制 Ark UI。' }],
      }],
    },
  },
  {
    files: ['apps/extension/components/ui/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['@/features/**', '**/features/**', '@/stores/**'], message: '基础组件不依赖业务模型或全局业务状态，通过属性与事件接入。' }],
      }],
    },
  },
  {
    rules: {
      // workspace 配置遵循项目固定的 pnpm 版本。
      'pnpm/yaml-enforce-settings': 'off',
      'no-console': 'off',
      'prefer-promise-reject-errors': 'off',
    },
  },
)
