import type { Config } from 'jest';

const config: Config = {
  displayName: 'api',
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  // Existing integration-style scripts (rls/audit) live alongside the Jest
  // specs but were originally written as standalone ts-node programs. We
  // explicitly include the new Jest specs and keep the old audit script out
  // of the testMatch so it doesn't crash the runner.
  testPathIgnorePatterns: ['<rootDir>/src/modules/audit/audit.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@erp/utils$': '<rootDir>/../../libs/utils/src/index.ts',
  },
  passWithNoTests: true,
  clearMocks: true,
  resetMocks: false,
};

export default config;
