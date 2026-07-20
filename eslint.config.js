// Flat ESLint config for the EdLight Academy WEB app.
//
// Philosophy: pragmatic, modern, bug-catching. This is a large, intentionally
// loosely-typed codebase. We keep genuine bug-catchers ON as errors
// (rules-of-hooks, no-undef for JS, no-dupe-keys, no-fallthrough, etc.) but
// turn cosmetic / style-only rules that would generate thousands of no-value
// edits down to "warn" or "off". The goal is: `npm run lint` -> 0 errors,
// with errors representing real problems.
//
// Scope: src/ and api/ only. mobile/ is a separate app with its own setup and
// is NOT linted here. Build output, generated code and large data files are
// ignored.

const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');
const react = require('eslint-plugin-react');
const globals = require('globals');

module.exports = tseslint.config(
  // ---- Global ignores -----------------------------------------------------
  {
    ignores: [
      'dist/',
      'build/',
      'node_modules/',
      'coverage/',
      'mobile/', // separate app, separate ESLint setup
      'public/',
      'public_original/',
      'pwa/',
      'scripts/',
      'edlight-academy/', // nested/legacy copy, not the live source
      '**/*.min.js',
      // Generated / vendored code
      'src/dataconnect-generated/',
      // Large generated data tables (no value linting, huge + machine-shaped)
      'src/data/triviaData.ts',
      'src/data/moKacheWords.ts',
    ],
  },

  // ---- Base recommended sets ----------------------------------------------
  js.configs.recommended,
  ...tseslint.configs.recommended, // NOT the type-checked / strict variants
  reactHooks.configs['recommended-latest'],

  // ---- React (non-type-checked, new JSX transform) ------------------------
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    ...react.configs.flat.recommended,
    settings: { react: { version: 'detect' } },
  },

  // ---- src/: browser + es2021 ---------------------------------------------
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },

  // ---- api/: node ---------------------------------------------------------
  {
    files: ['api/**/*.{ts,js}', 'shared/**/*.{ts,js}'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2021 },
    },
  },

  // ---- Config / build / node script files ---------------------------------
  {
    files: ['*.js', '*.cjs', '*.mjs', '*.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },

  // ---- Tests: jest globals ------------------------------------------------
  {
    files: [
      '**/*.test.{ts,tsx,js,jsx}',
      '**/*.spec.{ts,tsx,js,jsx}',
      '**/__tests__/**',
      'test/**',
      'jest.setup.js',
      'jest.config.js',
    ],
    languageOptions: {
      // Tests run in jsdom, so browser globals (HTMLElement, document, ...)
      // are available alongside jest + node.
      globals: { ...globals.browser, ...globals.jest, ...globals.node },
    },
  },

  // ---- Rule tuning (the important part) -----------------------------------
  {
    rules: {
      // Cosmetic / intentional-looseness: down to warn/off to avoid churn.
      '@typescript-eslint/no-explicit-any': 'off', // codebase is intentionally loose
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      'react/prop-types': 'off', // this is TypeScript
      'react/react-in-jsx-scope': 'off', // new JSX transform
      'react/no-unescaped-entities': 'off', // heavy FR/HT copy, cosmetic
      'react/display-name': 'off',
      'no-empty': 'warn',
      // Mixed const/let destructuring is common here; only flag when *all*
      // bindings could be const (avoids churn on single-binding false hits).
      'prefer-const': ['error', { destructuring: 'all' }],
      // TS handles undefined identifiers in .ts/.tsx; no-undef there produces
      // false positives on TS-only globals/types, so it's disabled for TS below.

      // Genuine bug-catchers stay ERROR (mostly from js.recommended, listed
      // here to make the intent explicit and immune to accidental weakening):
      'no-fallthrough': 'error',
      'no-dupe-keys': 'error',
      'no-cond-assign': ['error', 'except-parens'],
      'no-unsafe-negation': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-self-assign': 'error',
      'no-setter-return': 'error',
      'no-unsafe-finally': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      // react-hooks/rules-of-hooks stays ERROR (from recommended) - real bugs.
    },
  },

  // ---- TS files: let the TS compiler own undefined-identifier checking -----
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
    },
  },
);
