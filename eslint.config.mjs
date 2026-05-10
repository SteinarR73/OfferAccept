import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/coverage/**'],
  },
  // Block ESM/CJS pitfalls in test files.
  // These patterns compile to top-level await in CJS (Jest) and cause runtime failures.
  {
    files: ['**/__tests__/**/*.ts', '**/__tests__/**/*.tsx', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'AwaitExpression > ImportExpression',
          message:
            'Do not use `await import()` in Jest tests — it compiles to top-level await which ' +
            'fails in CommonJS. Use a static import or require() instead.',
        },
        {
          selector: "CallExpression[callee.name='__importStar']",
          message:
            '__importStar(require(...)) is a compiled artefact of dynamic import — do not write it ' +
            'directly. Use a static import instead.',
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
