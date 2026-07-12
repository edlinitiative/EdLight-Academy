/**
 * Jest configuration for EdLight Academy.
 *
 * Scope: unit tests for framework-agnostic logic and React hooks/components
 * (jsdom environment). Transpilation is handled by babel-jest via the
 * test-only babel.config.js, reusing the same presets as the webpack build.
 */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  // Allow importing the pure `.mjs` chunk builders (scripts/sandra_kb_chunks.mjs)
  // from unit tests. `.mjs` is resolved via moduleFileExtensions and transpiled
  // by babel-jest — Jest's default transform regex (`\.[jt]sx?$`) skips `.mjs`,
  // so it must be added explicitly or its `export` syntax fails to parse.
  moduleFileExtensions: ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'json', 'node'],
  transform: {
    '^.+\\.(js|mjs|cjs|jsx|ts|tsx)$': 'babel-jest',
  },
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}', '**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Stub static assets and CSS so importing components in tests never fails.
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/test/styleMock.js',
    '\\.(png|jpe?g|gif|svg|webp|woff2?)$': '<rootDir>/test/fileMock.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  clearMocks: true,
  // Heavy generated/data folders are never unit-tested.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/src/dataconnect-generated/',
  ],
};
