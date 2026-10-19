const base = require('./jest.config');
module.exports = {
  ...base,
  testEnvironment: 'node',
  testTimeout: 30000,
  roots: ['<rootDir>/api'],
  setupFilesAfterEnv: [],
  testMatch: ['**/competitionEmulator.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
};
