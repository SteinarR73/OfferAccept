'use client';

import { useEffect, useRef, useState } from 'react';
import { useCurrentOrg } from '@/lib/org-context';
import { getOrg } from '@/lib/offers-api';
import { cn } from '@/lib/cn';

// ─── OrgSelector ───────────────────────────────────────────────────────────────
// Shows the current organization with a dropdown.
// Fetches org name from /organizations/me; falls back to abbreviated orgId.
//
// Keyboard: Enter/Space to open, Escape to close, Tab cycles options.
// Future: multi-org switching via POST /auth/switch-org.

export function OrgSelector() {
  const { orgId, orgRole } = useCurrentOrg();
  const [orgName, setOrgName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fetch org name
  useEffect(() => {
    getOrg()
      .then((org) => setOrgName(org.name))
      .catch(() => {/* silent fallback */});
  }, [orgId]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const displayName = orgName ?? `Org …${orgId.slice(-6)}`;
  const roleLabel = orgRole.charAt(0) + orgRole.slice(1).toLowerCase();

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Current organization: ${displayName}. Your role: ${roleLabel}`}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm',
          'text-slate-300 bg-white/5 hover:bg-white/10 transition-colors',
          'border border-white/10',
          'focus-visible:ring-2 focus-visible:ring-[--color-accent]',
        )}
      >
        {/* Org avatar */}
        <span
          className="flex-shrink-0 w-7 h-7 rounded-md bg-[--color-accent] text-white text-xs font-bold flex items-center justify-center select-none"
          aria-hidden="true"
        >
          {(orgName ?? 'O').charAt(0).toUpperCase()}
        </span>

        <span className="flex-1 text-left min-w-0">
          <span className="block font-medium text-white/90 truncate">{displayName}</span>
          <span className="block text-xs text-slate-400">{roleLabel}</span>
        </span>

        {/* Chevron */}
        <svg
          className={cn('w-4 h-4 text-slate-500 flex-shrink-0 transition-transform', open && 'rotate-180')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Organizations"
          className={cn(
            'absolute bottom-full left-0 right-0 mb-1 z-50',
            'bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden',
            'animate-fade-in',
          )}
        >
          {/* Current org (selected) */}
          <div
            role="option"
            aria-selected="true"
            className="flex items-center gap-2.5 px-3 py-2.5 bg-[--color-accent-light] cursor-default"
          >
            <span
              className="w-7 h-7 rounded-md bg-[--color-accent] text-white text-xs font-bold flex items-center justify-center"
              aria-hidden="true"
            >
              {(orgName ?? 'O').charAt(0).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
              <p className="text-xs text-[--color-accent]">{roleLabel} · current</p>
            </div>
            <svg className="w-4 h-4 text-[--color-accent]" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15 3.293 9.879a1 1 0 011.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>

          {/* Future: additional orgs listed here */}
          <div className="px-3 py-2 border-t border-gray-100">
            <p className="text-xs text-gray-400 italic">Multi-org switching coming soon</p>
          </div>
        </div>
      )}
    </div>
  );
}
