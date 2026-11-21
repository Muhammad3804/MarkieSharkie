import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

// CLAUDE.md "Database access": SQL is a plain string with $1, $2 placeholders; values go in the params array.
// These selectors catch the two common ways of building SQL from values by accident.
const SQL_BUILDING = [
  {
    selector:
      "CallExpression[callee.property.name='query'] > TemplateLiteral.arguments:first-child[expressions.length>0]",
    message: 'Do not interpolate values into SQL. Use $1, $2 placeholders and the params array.',
  },
  {
    selector: "CallExpression[callee.property.name='query'] > BinaryExpression.arguments:first-child[operator='+']",
    message: 'Do not concatenate SQL. Use $1, $2 placeholders and the params array.',
  },
]

export default [
  { ignores: ['node_modules/', 'coverage/', 'migrations/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-restricted-syntax': ['error', ...SQL_BUILDING],
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
    },
  },
  prettier,
]
