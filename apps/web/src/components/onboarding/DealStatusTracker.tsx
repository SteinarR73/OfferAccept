'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StepStatus = 'done' | 'active' | 'pending';

export interface TrackerStep {
  label: string;
  status: StepStatus;
}

interface Props {
  steps: TrackerStep[];
  className?: string;
}

// ─── DealStatusTracker ────────────────────────────────────────────────────────
// Horizontal step indicator used in the deal sent success banner.
// Each step shows: done (filled check), active (pulsing dot), pending (gray).

export function DealStatusTracker({ steps, className }: Props) {
  return (
    <div className={cn('flex items-center', className)}>
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            {/* Circle indicator */}
            <div
              className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
                s.status === 'done'
                  ? 'bg-(--color-success)'
                  : s.status === 'active'
                  ? 'bg-(--color-surface) border-2 border-(--color-success)'
                  : 'bg-(--color-surface) border-2 border-(--color-border)',
              )}
              aria-hidden="true"
            >
              {s.status === 'done' && (
                <Check className="w-3 h-3 text-white" />
              )}
              {s.status === 'active' && (
                <span className="w-2 h-2 rounded-full bg-(--color-success) animate-pulse" />
              )}
            </div>

            {/* Label */}
            <span
              className={cn(
                'text-[10px] font-medium whitespace-nowrap',
                s.status === 'done'
                  ? 'text-(--color-success)'
                  : s.status === 'active'
                  ? 'text-(--color-text-primary)'
                  : 'text-(--color-text-muted)',
              )}
            >
              {s.label}
            </span>
          </div>

          {/* Connector line — not rendered after last step */}
          {i < steps.length - 1 && (
            <div
              className={cn(
                'flex-1 h-0.5 mx-1 mb-4',
                s.status === 'done' ? 'bg-(--color-success)' : 'bg-(--color-border)',
              )}
              aria-hidden="true"
            />
          )}
        </div>
      ))}
    </div>
  );
}
