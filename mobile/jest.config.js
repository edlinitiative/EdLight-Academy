module.exports = {
  preset: 'jest-expo',
  // Only pick up files that end in .test.ts / .test.tsx under __tests__ folders,
  // so fixture/helper modules colocated in those folders aren't run as suites.
  testMatch: ['**/__tests__/**/*.test.{ts,tsx,js,jsx}'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  // /shared modules live OUTSIDE this package, so their injected babel helpers
  // (@babel/runtime) must also resolve from mobile/node_modules — otherwise the
  // suites only pass when the repo root happens to have its own node_modules.
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
  // jest-expo ships a sensible transformIgnorePatterns default that whitelists
  // the RN / Expo / community packages that ship untranspiled ESM.
};
