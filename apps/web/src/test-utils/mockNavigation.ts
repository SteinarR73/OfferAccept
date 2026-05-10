// Typed accessors and assertion helpers for the next/navigation Jest mock.
//
// The global moduleNameMapper in jest.config.ts routes next/navigation →
// src/__mocks__/next-navigation.ts, so no jest.mock() call is needed in tests.
//
// Usage:
//   import { expectRedirectOnce, resetNavigationMocks } from '@/test-utils/mockNavigation';
//
//   beforeEach(() => {
//     resetNavigationMocks();
//   });
//
//   // Positive: exactly one redirect to a known path
//   expectRedirectOnce('/expected-path');
//
//   // Positive: one redirect matching a dynamic pattern
//   expectRedirectMatching('/accept/');
//
//   // Negative: no redirect should occur
//   expect(mockRedirect).not.toHaveBeenCalled();

import { expect } from '@jest/globals';
import type { redirect as RedirectFn } from 'next/navigation';
import { redirect } from 'next/navigation';

export const mockRedirect = redirect as jest.MockedFunction<typeof RedirectFn>;

// ── Reset ────────────────────────────────────────────────────────────────────

export const resetNavigationMocks = (): void => {
  mockRedirect.mockClear();
};

// ── Positive invariant — exact path ──────────────────────────────────────────
//
// Assertion order is intentional:
//   1. toHaveBeenCalled()    — clearest failure when redirect is missing entirely
//   2. toHaveBeenCalledTimes — catches double-dispatch
//   3. toHaveBeenCalledWith  — catches wrong destination

export const expectRedirectOnce = (path: string): void => {
  expect(mockRedirect).toHaveBeenCalled();
  expect(mockRedirect).toHaveBeenCalledTimes(1);
  // Direct calls array diff: shows [['actual']] vs [['expected']] on failure,
  // which is easier to scan than toHaveBeenCalledWith's argument-level diff.
  expect(mockRedirect.mock.calls).toEqual([[path]]);
};

// ── Positive invariant — dynamic / partial path ───────────────────────────────
//
// Use when the full path contains a generated segment (e.g. a UUID) that
// cannot be known at test-write time. Prefer expectRedirectOnce when the
// path is fully known — the exact match produces a better diff on failure.

export const expectRedirectMatching = (matcher: string | RegExp): void => {
  expect(mockRedirect).toHaveBeenCalled();
  expect(mockRedirect).toHaveBeenCalledTimes(1);
  // Extract the raw string so the failure shows the actual path, not a matcher
  // description like "StringContaining('/accept/')".
  const call = mockRedirect.mock.calls[0][0];
  if (typeof matcher === 'string') {
    expect(call).toContain(matcher);
  } else {
    expect(call).toMatch(matcher);
  }
};
