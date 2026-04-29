// Integration test: /sign/[token] → /accept/[token] permanent redirect.
//
// Verifies that:
//   1. The redirect targets the canonical /accept/[token] path.
//   2. The token is forwarded verbatim — no truncation, encoding, or modification.
//   3. The redirect fires exactly once per request (no double-dispatch).
//
// next/navigation's redirect() throws a NEXT_REDIRECT error in the real runtime.
// We mock it as a plain jest.fn() so the server component can be called without
// the throw, and we assert the call arguments directly.

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

// Dynamic import after mocking so the module picks up the mock.
const { redirect } = await import('next/navigation');
const { default: SignRedirectPage } = await import('../[token]/page');

describe('/sign/[token] — permanent redirect to /accept/[token]', () => {
  beforeEach(() => {
    (redirect as unknown as ReturnType<typeof jest.fn>).mockClear();
  });

  it('redirects to /accept/<token>', async () => {
    const token = 'oa_abc123';
    await SignRedirectPage({ params: Promise.resolve({ token }) });
    expect(redirect).toHaveBeenCalledWith('/accept/oa_abc123');
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it('forwards the full token verbatim — no truncation or modification', async () => {
    // A realistic token: "oa_" prefix + 43 url-safe chars (opaque, full length)
    const token = 'oa_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v';
    await SignRedirectPage({ params: Promise.resolve({ token }) });
    expect(redirect).toHaveBeenCalledWith(`/accept/${token}`);
  });

  it('handles tokens with hyphens and underscores', async () => {
    const token = 'oa_foo-bar_baz';
    await SignRedirectPage({ params: Promise.resolve({ token }) });
    expect(redirect).toHaveBeenCalledWith('/accept/oa_foo-bar_baz');
  });
});
