import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

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
  // apps/web only: react-hooks + Next.js rules. Scoped here (not global) because
  // apps/api is plain NestJS/TypeScript with no React.
  //
  // react-hooks: deliberately configured with only the two long-established
  // classic rules (rules-of-hooks, exhaustive-deps), not the plugin's full
  // "recommended" preset — v7's preset also enables ~13 new React-Compiler-
  // oriented rules (immutability, purity, set-state-in-render, etc.) most as
  // errors. This codebase has never been checked against any react-hooks rule
  // before, so adopting that full set here would be a much larger, separate
  // undertaking with unknown blast radius, not a fix for the actual gap (three
  // `eslint-disable-next-line react-hooks/exhaustive-deps` comments erroring
  // because the rule didn't exist to disable).
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      ...nextPlugin.configs['core-web-vitals'].rules,
      // This project is App Router only — no pages/ directory exists anywhere,
      // by design. This rule assumes Pages Router and errors just trying to
      // locate a pages/ dir that was deliberately never created.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
];
