'use client';

import { usePathname } from 'next/navigation';
import { LegalFooter } from './LegalFooter';

// ─── ConditionalFooter ────────────────────────────────────────────────────────
// Renders LegalFooter only on pages that don't have their own footer and
// aren't part of the authenticated app shell.
//
// Suppressed on:
//   /dashboard/**   — authenticated app shell with sidebar nav
//   /landing        — has its own full LandingFooter
//   /sign/**        — signing flow (recipient-facing, no legal chrome needed)
//   /accept/**      — acceptance flow (recipient-facing, no legal chrome needed)
//   /verify/:id     — has its own AboutCertificate footer section
//                     (/verify with no segment = search page, footer shown)

export function ConditionalFooter() {
  const pathname = usePathname() ?? '';

  const suppress =
    pathname.startsWith('/dashboard') ||
    pathname === '/landing' ||
    pathname.startsWith('/landing/') ||
    pathname.startsWith('/sign/') ||
    pathname.startsWith('/accept/') ||
    // /verify/[certificateId] has its own footer; /verify (no segment) does not
    (pathname.startsWith('/verify/') && pathname !== '/verify');

  if (suppress) return null;

  return <LegalFooter />;
}
