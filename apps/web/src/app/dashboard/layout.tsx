'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { isAuthenticated, logout } from '../../lib/auth';
import { getMe } from '../../lib/offers-api';
import { OrgProvider, type OrgState } from '../../lib/org-context';
import { OrgSelector } from '../../components/dashboard/OrgSelector';
import { cn } from '../../lib/cn';

// ─── Nav items ─────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
}

function IconOffers() {
  return (
    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: <IconHome />, exact: true },
  { href: '/dashboard/offers', label: 'Offers', icon: <IconOffers /> },
  { href: '/dashboard/settings', label: 'Settings', icon: <IconSettings /> },
];

// ─── DashboardLayout ───────────────────────────────────────────────────────────
// Guards all /dashboard/* routes — redirects to /login if no token.
// Bootstraps OrgProvider with the current user's org context from /auth/me.
// Renders a responsive sidebar (240px desktop, drawer on mobile).

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [orgState, setOrgState] = useState<OrgState | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    getMe()
      .then((me) => {
        setOrgState({
          orgId: me.orgId,
          orgRole: me.orgRole as OrgState['orgRole'],
        });
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Trap focus in mobile sidebar when open
  useEffect(() => {
    if (sidebarOpen) closeButtonRef.current?.focus();
  }, [sidebarOpen]);

  // Close on Escape
  useEffect(() => {
    if (!sidebarOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSidebarOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  if (!orgState) {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-label="Loading dashboard">
        <div className="w-8 h-8 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <OrgProvider initial={orgState}>
      <div className="flex min-h-screen bg-gray-50">
        {/* ── Mobile sidebar backdrop ─────────────────────────────────────────── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            aria-hidden="true"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
        <aside
          id="sidebar"
          aria-label="Main navigation"
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex flex-col w-60 bg-white border-r border-gray-200 transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {/* Logo + close button (mobile) */}
          <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100 flex-shrink-0">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-semibold text-gray-900 text-sm focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              <span className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold select-none">
                OA
              </span>
              OfferAccept
            </Link>
            <button
              ref={closeButtonRef}
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded text-gray-400 hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Close navigation"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Nav links */}
          <nav aria-label="Sidebar navigation" className="flex-1 overflow-y-auto py-3 px-2">
            <ul role="list" className="flex flex-col gap-0.5">
              {NAV_ITEMS.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        'focus-visible:ring-2 focus-visible:ring-blue-500',
                        active
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                      )}
                    >
                      <span className={cn('flex-shrink-0', active ? 'text-blue-600' : 'text-gray-400')}>
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Org selector + logout */}
          <div className="flex-shrink-0 border-t border-gray-100 p-3 flex flex-col gap-2">
            <OrgSelector />
            <button
              onClick={handleLogout}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium',
                'text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors',
                'focus-visible:ring-2 focus-visible:ring-blue-500',
              )}
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </aside>

        {/* ── Main content ────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile top bar */}
          <header className="lg:hidden flex items-center h-14 px-4 bg-white border-b border-gray-200 flex-shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-expanded={sidebarOpen}
              aria-controls="sidebar"
              aria-label="Open navigation"
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link href="/dashboard" className="ml-3 font-semibold text-sm text-gray-900">
              OfferAccept
            </Link>
          </header>

          {/* Page content */}
          <main id="main-content" className="flex-1 overflow-y-auto p-4 sm:p-6">
            {children}
          </main>
        </div>
      </div>
    </OrgProvider>
  );
}
