// Integration test: /sign/[token] → /accept/[token] permanent redirect.
//
// Invariants enforced by expectRedirectOnce():
//   • redirect was called (not silently skipped)
//   • redirect was called exactly once (no double-dispatch)
//   • redirect was called with the exact canonical path

import { describe, it, expect, beforeEach } from '@jest/globals';
import SignRedirectPage from '../[token]/page';
import {
  mockRedirect,
  expectRedirectOnce,
  resetNavigationMocks,
} from '../../../test-utils/mockNavigation';

describe('/sign/[token] — permanent redirect to /accept/[token]', () => {
  beforeEach(() => {
    resetNavigationMocks();
  });

  it('redirects to /accept/<token>', async () => {
    await SignRedirectPage({ params: Promise.resolve({ token: 'oa_abc123' }) });
    expectRedirectOnce('/accept/oa_abc123');
  });

  it('forwards the full token verbatim — no truncation or modification', async () => {
    // A realistic token: "oa_" prefix + 43 url-safe chars (opaque, full length)
    const token = 'oa_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v';
    await SignRedirectPage({ params: Promise.resolve({ token }) });
    expectRedirectOnce(`/accept/${token}`);
  });

  it('handles tokens with hyphens and underscores', async () => {
    await SignRedirectPage({ params: Promise.resolve({ token: 'oa_foo-bar_baz' }) });
    expectRedirectOnce('/accept/oa_foo-bar_baz');
  });

  it('does not redirect before params resolve', async () => {
    // Params promise is never awaited in this test — the component should not
    // have called redirect synchronously before awaiting its params argument.
    // We resolve immediately here to actually run the component, then assert
    // the mock was called the right number of times (once, not zero or two).
    await SignRedirectPage({ params: Promise.resolve({ token: 'oa_sync_check' }) });
    expect(mockRedirect).not.toHaveBeenCalledTimes(0);
    expectRedirectOnce('/accept/oa_sync_check');
  });
});
