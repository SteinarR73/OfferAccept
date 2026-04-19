'use client';

import { useState, useEffect, useRef, useId } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Props {
  children?: React.ReactNode;
  className?: string;
  side?: 'top' | 'bottom';
}

// ─── CertificateInfoTooltip ───────────────────────────────────────────────────
// Wraps any content with an inline ⓘ button that reveals an explanation of
// what an acceptance certificate is. Closes on outside click or Escape.
//
// Usage:
//   <CertificateInfoTooltip>Certificate</CertificateInfoTooltip>
//   <CertificateInfoTooltip side="bottom" className="ml-1" />

export function CertificateInfoTooltip({
  children,
  className,
  side = 'top',
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <span ref={containerRef} className={cn('relative inline-flex items-center gap-1', className)}>
      {children}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="What is an acceptance certificate?"
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        className="text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={cn(
            'absolute left-1/2 -translate-x-1/2 z-30 w-72 rounded-xl border border-(--color-border) bg-(--color-surface) shadow-lg p-4 text-left animate-fade-in',
            side === 'top'    ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          <p className="text-xs font-semibold text-(--color-text-primary) mb-1.5">
            What&apos;s an acceptance certificate?
          </p>
          <p className="text-xs text-(--color-text-secondary) leading-relaxed mb-2">
            A tamper-evident record proving a specific person — identified by name and email —
            accepted a specific version of your document at a specific date and time.
          </p>
          <p className="text-xs text-(--color-text-secondary) leading-relaxed mb-2">
            Any modification to the document after acceptance is detectable. You can download
            it as a PDF or share a verification link any time from your dashboard.
          </p>
          <p className="text-[11px] text-(--color-text-muted) italic leading-relaxed">
            OfferAccept is not an e-signature platform. The certificate records acceptance,
            not a legal signature.
          </p>
        </span>
      )}
    </span>
  );
}
