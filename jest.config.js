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
