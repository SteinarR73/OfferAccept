'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAuthenticated, clearToken } from '../../lib/auth';

// ─── DashboardLayout ──────────────────────────────────────────────────────────
// Guards all /dashboard/* routes — redirects to /login if no token.
// Provides a minimal nav bar.

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
    }
  }, [router]);

  function handleLogout() {
    clearToken();
    router.replace('/login');
  }

  return (
    <div>
      <nav
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
        }}
      >
        <Link href="/dashboard" style={{ fontWeight: 600 }}>
          OfferAccept
        </Link>
        <Link href="/dashboard">Offers</Link>
        <button
          onClick={handleLogout}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </nav>
      <main style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>{children}</main>
    </div>
  );
}
