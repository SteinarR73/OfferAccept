'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Search, Plus, LayoutDashboard, FileText, CreditCard,
  Settings, LogOut, ArrowRight, Command,
} from 'lucide-react';
import { logout } from '@/lib/auth';
import { cn } from '@/lib/cn';

// ─── Command definitions ───────────────────────────────────────────────────────

interface PaletteCommand {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
}

// ─── CommandPalette ────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Build commands — stable because router/onClose/logout don't change
  const commands: PaletteCommand[] = [
    {
      id: 'new-deal',
      label: 'New deal',
      description: 'Create a new deal',
      icon: <Plus className="w-4 h-4" aria-hidden="true" />,
      action: () => { router.push('/dashboard/deals/new'); onClose(); },
      keywords: ['create', 'draft'],
    },
    {
      id: 'dashboard',
      label: 'Go to Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" aria-hidden="true" />,
      action: () => { router.push('/dashboard'); onClose(); },
      keywords: ['overview', 'home'],
    },
    {
      id: 'deals',
      label: 'Go to Deals',
      icon: <FileText className="w-4 h-4" aria-hidden="true" />,
      action: () => { router.push('/dashboard/deals'); onClose(); },
      keywords: ['list', 'all deals'],
    },
    {
      id: 'billing',
      label: 'Open Billing',
      description: 'Manage your plan and invoices',
      icon: <CreditCard className="w-4 h-4" aria-hidden="true" />,
      action: () => { router.push('/dashboard/billing'); onClose(); },
      keywords: ['plan', 'payment', 'upgrade'],
    },
    {
      id: 'settings',
      label: 'Open Settings',
      description: 'Team, API keys, webhooks',
      icon: <Settings className="w-4 h-4" aria-hidden="true" />,
      action: () => { router.push('/dashboard/settings'); onClose(); },
      keywords: ['profile', 'team', 'api', 'webhooks'],
    },
    {
      id: 'logout',
      label: 'Sign out',
      icon: <LogOut className="w-4 h-4" aria-hidden="true" />,
      action: async () => { onClose(); await logout(); router.replace('/login'); },
      keywords: ['exit', 'log out'],
    },
  ];

  // Filter by query
  const filtered = query.trim() === ''
    ? commands
    : commands.filter(({ label, description, keywords }) => {
        const q = query.toLowerCase();
        return (
          label.toLowerCase().includes(q) ||
          description?.toLowerCase().includes(q) ||
          keywords?.some((k) => k.includes(q))
        );
      });

  // Reset active index when filtered list changes
  useEffect(() => { setActiveIdx(0); }, [filtered.length]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      // Slight delay to ensure portal has rendered
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    const item = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[activeIdx]?.action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [filtered, activeIdx, onClose]);

  if (!open) return null;

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] px-4"
      aria-modal="true"
      role="dialog"
      aria-label="Command palette"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 animate-backdrop-in"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-palette-in border border-gray-200"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="command-list"
            aria-activedescendant={filtered[activeIdx] ? `cmd-${filtered[activeIdx].id}` : undefined}
            placeholder="Type a command or search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 py-4 text-sm text-gray-900 bg-transparent placeholder:text-gray-400 outline-none"
          />
          <kbd className="hidden sm:flex items-center gap-1 text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 font-mono">
            esc
          </kbd>
        </div>

        {/* Command list */}
        {filtered.length > 0 ? (
          <ul
            id="command-list"
            ref={listRef}
            role="listbox"
            aria-label="Commands"
            className="py-2 max-h-80 overflow-y-auto"
          >
            {filtered.map((cmd, i) => (
              <li
                key={cmd.id}
                id={`cmd-${cmd.id}`}
                role="option"
                aria-selected={i === activeIdx}
                onClick={cmd.action}
                onMouseEnter={() => setActiveIdx(i)}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                  i === activeIdx ? 'bg-blue-50' : 'hover:bg-gray-50',
                )}
              >
                <span className={cn(
                  'flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center',
                  i === activeIdx ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500',
                )}>
                  {cmd.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm font-medium',
                    i === activeIdx ? 'text-blue-900' : 'text-gray-900',
                  )}>
                    {cmd.label}
                  </p>
                  {cmd.description && (
                    <p className="text-xs text-gray-400 truncate">{cmd.description}</p>
                  )}
                </div>
                {i === activeIdx && (
                  <ArrowRight className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-10 text-center">
            <p className="text-sm text-gray-400">No commands match "{query}"</p>
          </div>
        )}

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
          <span className="flex items-center gap-1 text-[11px] text-gray-400">
            <kbd className="font-mono border border-gray-200 rounded px-1 py-0.5 bg-white text-[10px]">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1 text-[11px] text-gray-400">
            <kbd className="font-mono border border-gray-200 rounded px-1 py-0.5 bg-white text-[10px]">↵</kbd>
            select
          </span>
          <span className="flex items-center gap-1 text-[11px] text-gray-400">
            <kbd className="font-mono border border-gray-200 rounded px-1 py-0.5 bg-white text-[10px]">esc</kbd>
            close
          </span>
          <span className="ml-auto flex items-center gap-1 text-[11px] text-gray-400">
            <Command className="w-3 h-3" aria-hidden="true" />
            <kbd className="font-mono text-[10px]">K</kbd>
          </span>
        </div>
      </div>
    </div>
  );

  // Render into body via portal to avoid z-index issues
  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

// ─── Hook: manage open state + keyboard trigger ────────────────────────────────

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return { open, setOpen };
}
