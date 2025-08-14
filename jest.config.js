// jest.config.js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/data-sync/tests/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/data-sync/tests/setup.ts'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    'data-sync/src/**/*.ts',
    '!data-sync/src/**/*.d.ts',
    '!data-sync/src/docs/**/*',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};