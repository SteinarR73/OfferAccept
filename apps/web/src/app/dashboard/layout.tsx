'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Briefcase, FolderOpen, Users, CreditCard, Settings,
  LogOut, Menu, X, ChevronRight, Search,
} from 'lucide-react';
import { isAuthenticated, logout } from '../../lib/auth';
import { getMe } from '../../lib/offers-api';
import { OrgProvider, type OrgState } from '../../lib/org-context';
import { OrgSelector } from '../../components/dashboard/OrgSelector';
import { SpinnerPage } from '../../components/ui/Spinner';
import { CommandPalette, useCommandPalette } from '../../components/ui/CommandPalette';
import { cn } from '../../lib/cn';

// ─── Nav items ─────────────────────────────────────────────────────────────────

interface NavItem { href: string; label: string; icon: ReactNode; exact?: boolean; }

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',              label: 'Overview',  icon: <LayoutDashboard className="w-4 h-4" aria-hidden="true" />, exact: true },
  { href: '/dashboard/deals',        label: 'Deals',     icon: <Briefcase       className="w-4 h-4" aria-hidden="true" /> },
  { href: '/dashboard/customers',    label: 'Customers', icon: <Users           className="w-4 h-4" aria-hidden="true" /> },
  { href: '/dashboard/documents',    label: 'Documents', icon: <FolderOpen      className="w-4 h-4" aria-hidden="true" /> },
  { href: '/dashboard/billing',      label: 'Billing',   icon: <CreditCard      className="w-4 h-4" aria-hidden="true" /> },
  { href: '/dashboard/settings',     label: 'Settings',  icon: <Settings        className="w-4 h-4" aria-hidden="true" /> },
];

// ─── Breadcrumb builder ────────────────────────────────────────────────────────

function buildBreadcrumb(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const LABELS: Record<string, string> = {
    dashboard: 'Overview',
    deals: 'Deals',
    customers: 'Customers',
    documents: 'Documents',
    offers: 'Deals',
    new: 'New deal',
    billing: 'Billing',
    settings: 'Settings',
  };

  const items = segments.map((seg, i) => {
    const href = '/' + segments.slice(0, i + 1).join('/');
    const label = LABELS[seg] ?? (seg.length > 20 ? seg.slice(0, 12) + '…' : seg);
    const isLast = i === segments.length - 1;
    return { label, href: isLast ? undefined : href };
  });

  return items;
}

// ─── DashboardLayout ───────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [orgState, setOrgState] = useState<OrgState | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    getMe()
      .then((me) => setOrgState({ orgId: me.orgId, orgRole: me.orgRole as OrgState['orgRole'] }))
      .catch(() => router.replace('/login'));
  }, [router]);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    if (sidebarOpen) closeButtonRef.current?.focus();
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setSidebarOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  async function handleLogout() { await logout(); router.replace('/login'); }

  if (!orgState) return <SpinnerPage label="Loading dashboard…" />;

  const breadcrumb = buildBreadcrumb(pathname ?? '');

  return (
    <OrgProvider initial={orgState}>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <div className="flex min-h-screen bg-[--color-bg]">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
        <aside
          id="sidebar"
          aria-label="Main navigation"
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex flex-col w-60 bg-white border-r border-gray-200',
            'transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {/* Logo */}
          <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100 flex-shrink-0">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-semibold text-gray-900 text-sm rounded focus-visible:ring-2 focus-visible:ring-blue-500"
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
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* Nav */}
          <nav aria-label="Sidebar navigation" className="flex-1 overflow-y-auto py-3 px-2">
            <ul role="list" className="flex flex-col gap-0.5">
              {NAV_ITEMS.map((item) => {
                const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
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

          {/* Org + logout */}
          <div className="flex-shrink-0 border-t border-gray-100 p-3 flex flex-col gap-2">
            <OrgSelector />
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <LogOut className="w-4 h-4 text-gray-400" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </aside>

        {/* ── Main content ────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile top bar */}
          <header className="lg:hidden flex items-center h-14 px-4 bg-white border-b border-gray-200 flex-shrink-0 gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-expanded={sidebarOpen}
              aria-controls="sidebar"
              aria-label="Open navigation"
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <Link href="/dashboard" className="font-semibold text-sm text-gray-900">
              OfferAccept
            </Link>
            <button
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
            >
              <Search className="w-4 h-4" aria-hidden="true" />
            </button>
          </header>

          <main id="main-content" className="flex-1 overflow-y-auto p-4 sm:p-6">
            {/* Breadcrumb */}
            {breadcrumb.length > 1 && (
              <nav aria-label="Breadcrumb" className="mb-5">
                <ol className="flex items-center gap-1 flex-wrap">
                  {breadcrumb.map((item, i) => {
                    const isLast = i === breadcrumb.length - 1;
                    return (
                      <li key={i} className="flex items-center gap-1">
                        {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300" aria-hidden="true" />}
                        {isLast || !item.href ? (
                          <span className="text-xs text-gray-500 font-medium" aria-current={isLast ? 'page' : undefined}>
                            {item.label}
                          </span>
                        ) : (
                          <Link href={item.href} className="text-xs text-[--color-text-muted] hover:text-gray-700 transition-colors font-medium">
                            {item.label}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            )}
            {children}
          </main>
        </div>
      </div>
    </OrgProvider>
  );
}
