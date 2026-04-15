'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Briefcase, CreditCard, Settings, Users,
  Award, LogOut, Menu, X, ChevronRight, Search, HelpCircle,
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

const NAV_ITEMS_PRIMARY: NavItem[] = [
  { href: '/dashboard',              label: 'Dashboard',    icon: <LayoutDashboard className="w-4 h-4" aria-hidden="true" />, exact: true },
  { href: '/dashboard/deals',        label: 'Offers',       icon: <Briefcase       className="w-4 h-4" aria-hidden="true" /> },
  { href: '/dashboard/customers',    label: 'Recipients',   icon: <Users           className="w-4 h-4" aria-hidden="true" /> },
  { href: '/dashboard/certificates', label: 'Certificates', icon: <Award           className="w-4 h-4" aria-hidden="true" /> },
  { href: '/dashboard/billing',      label: 'Billing',      icon: <CreditCard      className="w-4 h-4" aria-hidden="true" /> },
];

const NAV_ITEMS_SECONDARY: NavItem[] = [
  { href: '/dashboard/settings', label: 'Settings', icon: <Settings    className="w-4 h-4" aria-hidden="true" /> },
  { href: '/dashboard/support',  label: 'Support',  icon: <HelpCircle  className="w-4 h-4" aria-hidden="true" /> },
];

// ─── Breadcrumb builder ────────────────────────────────────────────────────────

function buildBreadcrumb(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const LABELS: Record<string, string> = {
    dashboard: 'Dashboard',
    deals: 'Offers',
    offers: 'Offers',
    new: 'New offer',
    customers: 'Recipients',
    certificates: 'Certificates',
    billing: 'Billing',
    settings: 'Settings',
    support: 'Support',
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
            'fixed inset-y-0 left-0 z-50 flex flex-col w-[--sidebar-width] bg-[--color-sidebar-bg] border-r border-white/5',
            'transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-white/5 flex-shrink-0">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-semibold text-white/90 text-sm rounded focus-visible:ring-2 focus-visible:ring-[--color-accent]"
            >
              <span className="w-7 h-7 rounded-lg bg-[--color-accent] flex items-center justify-center text-white text-xs font-bold select-none">
                OA
              </span>
              OfferAccept
            </Link>
            <button
              ref={closeButtonRef}
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded text-slate-400 hover:text-white focus-visible:ring-2 focus-visible:ring-[--color-accent]"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* Nav */}
          <nav aria-label="Sidebar navigation" className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-4">
            {/* Primary nav */}
            <ul role="list" className="flex flex-col gap-0.5">
              {NAV_ITEMS_PRIMARY.map((item) => {
                const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        'focus-visible:ring-2 focus-visible:ring-[--color-accent]',
                        active
                          ? 'bg-[--color-sidebar-active-bg] text-[--color-sidebar-active-text]'
                          : 'text-[--color-sidebar-text] hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <span className={cn('flex-shrink-0', active ? 'text-[--color-sidebar-active-text]' : 'text-slate-500')}>
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {/* Secondary nav */}
            <ul role="list" className="flex flex-col gap-0.5 border-t border-white/5 pt-3">
              {NAV_ITEMS_SECONDARY.map((item) => {
                const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        'focus-visible:ring-2 focus-visible:ring-[--color-accent]',
                        active
                          ? 'bg-[--color-sidebar-active-bg] text-[--color-sidebar-active-text]'
                          : 'text-[--color-sidebar-text] hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <span className={cn('flex-shrink-0', active ? 'text-[--color-sidebar-active-text]' : 'text-slate-500')}>
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
          <div className="flex-shrink-0 border-t border-white/5 p-3 flex flex-col gap-2">
            <OrgSelector />

            {/* ⌘K discovery hint */}
            <button
              onClick={() => setPaletteOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-colors focus-visible:ring-2 focus-visible:ring-[--color-accent] group"
              aria-label="Open command palette"
            >
              <Search className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <span className="flex-1 text-left">Search</span>
              <kbd className="hidden lg:flex items-center gap-0.5 font-mono text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors">
                <span>⌘</span><span>K</span>
              </kbd>
            </button>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[--color-accent]"
            >
              <LogOut className="w-4 h-4 text-slate-500" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </aside>

        {/* ── Main content ────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile top bar */}
          <header className="lg:hidden flex items-center h-16 px-4 bg-[--color-sidebar-bg] border-b border-white/5 flex-shrink-0 gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-expanded={sidebarOpen}
              aria-controls="sidebar"
              aria-label="Open navigation"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-[--color-accent] transition-colors"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <Link href="/dashboard" className="font-semibold text-sm text-white/90">
              OfferAccept
            </Link>
            <button
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[--color-accent] transition-colors"
            >
              <Search className="w-4 h-4" aria-hidden="true" />
            </button>
          </header>

          <main id="main-content" className="flex-1 overflow-y-auto p-8">
            {/* Breadcrumb */}
            {breadcrumb.length > 1 && (
              <nav aria-label="Breadcrumb" className="mb-5">
                <ol className="flex items-center gap-1 flex-wrap">
                  {breadcrumb.map((item, i) => {
                    const isLast = i === breadcrumb.length - 1;
                    return (
                      <li key={i} className="flex items-center gap-1">
                        {i > 0 && <ChevronRight className="w-3 h-3 text-[--color-text-muted]" aria-hidden="true" />}
                        {isLast || !item.href ? (
                          <span className="text-xs text-[--color-text-secondary] font-medium" aria-current={isLast ? 'page' : undefined}>
                            {item.label}
                          </span>
                        ) : (
                          <Link href={item.href} className="text-xs text-[--color-text-muted] hover:text-[--color-text-primary] transition-colors font-medium">
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
