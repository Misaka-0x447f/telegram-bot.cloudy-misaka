module.exports = {
  env: {
    es2021: true,
    node: true
  },
  extends: [
    'standard'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module'
  },
  plugins: [
    '@typescript-eslint'
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', {
      varsIgnorePattern: '_+',
      argsIgnorePattern: '_+',
      ignoreRestSiblings: true
    }],
    'no-unused-vars': 'off'
  }
}
