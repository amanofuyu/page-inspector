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
    rules: {
      // workspace 配置遵循项目固定的 pnpm 版本。
      'pnpm/yaml-enforce-settings': 'off',
      'no-console': 'off',
      'prefer-promise-reject-errors': 'off',
    },
  },
)
