import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  roots: ['<rootDir>/src', '<rootDir>/test'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^pg-boss$': '<rootDir>/test/__mocks__/pg-boss.ts',
    '^@offeraccept/database$': '<rootDir>/../../packages/database/src/index.ts',
    '^@offeraccept/types$': '<rootDir>/../../packages/types/src/index.ts',
  },
};

export default config;
