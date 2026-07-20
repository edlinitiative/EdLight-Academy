// Flat ESLint config for the EdLight Academy MOBILE app (Expo SDK 54 / RN 0.81 / React 19).
//
// Philosophy mirrors the web app's eslint.config.js: pragmatic, modern,
// bug-catching. This is an intentionally loosely-typed codebase, so we keep
// genuine bug-catchers ON as errors (react-hooks/rules-of-hooks, no-undef for
// JS, no-dupe-keys, no-fallthrough, no-unreachable, use-isnan, ...) but dial
// cosmetic / style-only rules down to warn/off so `npm run lint` -> 0 errors,
// with errors representing real problems.
//
// Base: eslint-config-expo/flat (covers RN/React/hooks/import/TypeScript for
// Expo) rather than the web app's hand-rolled base.

const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  // ---- Global ignores -----------------------------------------------------
  {
    ignores: [
      'node_modules/',
      '.expo/',
      'dist/',
      'android/',
      'ios/',
      'web-build/',
      'coverage/',
      // Large generated bundles / data tables (no value linting; machine-shaped).
      'src/components/katexAssets.ts', // generated offline-KaTeX asset bundle
      'src/data/triviaData.ts',
      'src/data/moKacheWords.ts',
    ],
  },

  // ---- Expo's recommended flat config -------------------------------------
  ...expoConfig,

  // ---- TS-only rule tuning (the @typescript-eslint plugin is only registered
  // for .ts/.tsx/.d.ts files by eslint-config-expo, so its rules must be
  // scoped there or ESLint errors "could not find plugin") ------------------
  {
    files: ['**/*.{ts,tsx}'],
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
    },
  },

  // ---- General rule tuning (all files) ------------------------------------
  {
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      'react/prop-types': 'off', // this is TypeScript
      'react/react-in-jsx-scope': 'off', // new JSX transform
      'react/no-unescaped-entities': 'off', // heavy FR/HT copy, cosmetic
      'react/display-name': 'off',
      'no-empty': 'warn',
      // Mixed const/let destructuring is common; only flag when *all* bindings
      // could be const (avoids churn on single-binding false hits).
      'prefer-const': ['error', { destructuring: 'all' }],

      // Genuine bug-catchers stay ERROR (make the intent explicit and immune to
      // accidental weakening):
      'react-hooks/rules-of-hooks': 'error',
      'no-fallthrough': 'error',
      'no-dupe-keys': 'error',
      'no-cond-assign': ['error', 'except-parens'],
      'no-unsafe-negation': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-dupe-args': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-self-assign': 'error',
      'no-setter-return': 'error',
      'no-unsafe-finally': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },

  // ---- CommonJS config / build files (node globals) -----------------------
  {
    files: ['*.js', '*.cjs', 'scripts/**/*.{js,cjs}'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable', process: 'readonly', __dirname: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // ---- ESM node scripts (e.g. scripts/genKatexAssets.mjs) -----------------
  {
    files: ['*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly' },
    },
  },

  // ---- Jest test + setup files (jest globals) -----------------------------
  {
    files: ['**/*.test.{ts,tsx,js,jsx}', '**/__tests__/**', 'jest.setup.js', 'jest.config.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        require: 'readonly',
        module: 'writable',
      },
    },
  },
];
