import antfu from '@antfu/eslint-config'

export default antfu(
  {
    formatters: true,
  },
  {
    ignores: ['.wxt/**/*', 'public/**/*'],
  },
  {
    rules: {
      'no-console': 'off',
      'prefer-promise-reject-errors': 'off',
    },
  },
)
