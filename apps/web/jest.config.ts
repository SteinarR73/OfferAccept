import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        // Allow path aliases in tests
        paths: {
          '@/*': ['./src/*'],
          '@offeraccept/types': ['../../packages/types/src/index.ts'],
        },
      },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@offeraccept/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^lucide-react$': '<rootDir>/src/__mocks__/lucide-react.ts',
    // Silence Next.js module imports in unit tests
    '^next/navigation$': '<rootDir>/src/__mocks__/next-navigation.ts',
    '^next/link$': '<rootDir>/src/__mocks__/next-link.tsx',
  },
};

export default config;
