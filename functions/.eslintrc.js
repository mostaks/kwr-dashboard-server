module.exports = {
  env: {
    browser: true,
    es6: true,
    node: true,
    jest: true,
  },
  extends: [
    'airbnb-typescript', // Uses the recommended rules from airbnb-typescript
    'airbnb/hooks',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2018,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: [
    'react',
    'react-hooks',
    '@typescript-eslint/eslint-plugin',
    'prettier',
    'baseline',
  ],
  rules: {
    camelcase: 'error',
    '@typescript-eslint/camelcase': 'off',
    'no-param-reassign': ['error', { props: false }],
    'no-underscore-dangle': ['error', { allow: ['_id'] }],
    'baseline/no-dist-imports': 'error',
    'baseline/enforce-src-imports': 'error',
    'baseline/no-reactstrap-button': 'off',
    'baseline/enforce-jsdoc-comments': 'off',
    'react/jsx-one-expression-per-line': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off',
    'import/prefer-default-export': 'off',
    'prefer-destructuring': ['error', { object: true, array: false }],
    radix: 'off',
    'react/jsx-wrap-multilines': [
      'error',
      {
        declaration: 'parens-new-line',
        assignment: 'parens-new-line',
        return: 'parens-new-line',
        arrow: 'parens-new-line',
        condition: 'parens-new-line',
        logical: 'ignore',
        prop: 'ignore',
      },
    ],
  },
  reportUnusedDisableDirectives: true,
};
