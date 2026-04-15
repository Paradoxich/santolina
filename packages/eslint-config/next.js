/** @type {import("eslint").Linter.Config} */
const config = {
  extends: [
    require.resolve('./base'),
    'plugin:@next/eslint-plugin-next/core-web-vitals',
  ],
  env: {
    browser: true,
    node: true,
  },
  rules: {
    '@next/next/no-html-link-for-pages': 'error',
    'react/no-unknown-property': 'off',
  },
}

module.exports = config
