module.exports = {
  preset: 'jest-expo',
  // Only pick up files that end in .test.ts / .test.tsx under __tests__ folders,
  // so fixture/helper modules colocated in those folders aren't run as suites.
  testMatch: ['**/__tests__/**/*.test.{ts,tsx,js,jsx}'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  // jest-expo ships a sensible transformIgnorePatterns default that whitelists
  // the RN / Expo / community packages that ship untranspiled ESM.
};
