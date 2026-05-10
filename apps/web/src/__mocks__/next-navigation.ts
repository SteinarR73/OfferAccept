// Global Jest mock for next/navigation.
//
// This file is automatically loaded in place of next/navigation for every test
// in this project via the moduleNameMapper entry in jest.config.ts. You do NOT
// need to call jest.mock('next/navigation') in individual test files.
//
// What this means for test authors:
//   - Real Next.js navigation behaviour (router, redirect, pathname) is NOT
//     exercised here. These tests verify application logic only.
//   - All exports are jest stubs. Assert on them via the typed helpers in
//     src/test-utils/mockNavigation.ts — do not import and cast manually.
//   - Always call resetNavigationMocks() in beforeEach to avoid cross-test
//     state leakage from call-count accumulation.

if (process.env['NODE_ENV'] !== 'test') {
  throw new Error(
    'next/navigation mock loaded outside a test environment. ' +
    'This file must only be used by Jest (NODE_ENV=test). ' +
    'Check your moduleNameMapper configuration.',
  );
}

export const useRouter = () => ({ push: () => {}, replace: () => {}, back: () => {} });
export const useParams = () => ({});
export const usePathname = () => '/';
export const useSearchParams = () => new URLSearchParams();
export const redirect = jest.fn();
