'use client';

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

// ─── Step definition ───────────────────────────────────────────────────────────

export interface TourStep {
  /** Matches `data-tour="..."` on a DOM element */
  target: string;
  title: string;
  body: string;
  /** Where to place the tooltip relative to the target */
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

interface Props {
  steps: TourStep[];
  /** Called when tour completes or is skipped */
  onDone?: () => void;
  storageKey?: string;
}

// ─── TourTooltip (forwardRef) ──────────────────────────────────────────────────

interface TooltipProps {
  step: TourStep;
  current: number;
  total: number;
  rect: DOMRect | null;
  onNext: () => void;
  onSkip: () => void;
}

const TourTooltip = forwardRef<HTMLDivElement, TooltipProps>(function TourTooltip(
  { step, current, total, rect, onNext, onSkip },
  ref,
) {
  const TOOLTIP_W = 280;
  const TOOLTIP_H_APPROX = 160;
  const PAD = 8;
  const GAP = 12;

  let style: React.CSSProperties = { position: 'fixed', zIndex: 10000, width: TOOLTIP_W };

  if (rect) {
    const placement = step.placement ?? inferPlacement(rect);
    if (placement === 'bottom') {
      style.top = rect.bottom + PAD + GAP;
      style.left = Math.max(8, rect.left + rect.width / 2 - TOOLTIP_W / 2);
    } else if (placement === 'top') {
      style.bottom = window.innerHeight - rect.top + PAD + GAP;
      style.left = Math.max(8, rect.left + rect.width / 2 - TOOLTIP_W / 2);
    } else if (placement === 'right') {
      style.top = Math.max(8, rect.top + rect.height / 2 - TOOLTIP_H_APPROX / 2);
      style.left = rect.right + PAD + GAP;
    } else {
      style.top = Math.max(8, rect.top + rect.height / 2 - TOOLTIP_H_APPROX / 2);
      style.right = window.innerWidth - rect.left + PAD + GAP;
    }
    // Clamp to viewport
    if ('left' in style && typeof style.left === 'number') {
      style.left = Math.min(style.left, window.innerWidth - TOOLTIP_W - 8);
    }
  } else {
    style.top = '50%';
    style.left = '50%';
    style.transform = 'translate(-50%, -50%)';
  }

  const isLast = current === total - 1;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={`Tour step ${current + 1} of ${total}: ${step.title}`}
      tabIndex={-1}
      style={style}
      className="bg-white rounded-xl shadow-2xl border border-gray-100 p-4 animate-fade-in focus:outline-none"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Step dots */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === current ? 'w-4 bg-blue-600' : 'w-1.5 bg-gray-200',
              )}
            />
          ))}
        </div>
        <span className="text-[10px] text-gray-400 tabular-nums">
          {current + 1} / {total}
        </span>
      </div>

      <h3 className="text-sm font-semibold text-gray-900 mb-1">{step.title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed mb-4">{step.body}</p>

      <div className="flex items-center justify-between">
        <button
          onClick={onSkip}
          className="text-xs text-gray-400 hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-blue-500 rounded transition-colors"
        >
          Skip tour
        </button>
        <button
          onClick={onNext}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
            'bg-blue-600 text-white hover:bg-blue-700',
            'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
          )}
        >
          {isLast ? 'Done' : 'Next →'}
        </button>
      </div>
    </div>
  );
});

// ─── OnboardingTour ────────────────────────────────────────────────────────────
// Spotlight technique: box-shadow on a positioned overlay punch-outs the target.
// Uses createPortal so it renders outside the sidebar/layout stacking contexts.

export function OnboardingTour({ steps, onDone, storageKey = 'oa_tour_v1' }: Props) {
  const [current, setCurrent] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    if (localStorage.getItem(storageKey) === 'done') {
      setVisible(false);
    } else {
      setVisible(true);
    }
  }, [storageKey]);

  const measureTarget = useCallback((stepIndex: number) => {
    const step = steps[stepIndex];
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect(r);
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      setRect(null);
    }
  }, [steps]);

  useEffect(() => {
    if (!visible || !mounted) return;
    measureTarget(current);
  }, [current, visible, mounted, measureTarget]);

  // Re-measure on resize/scroll
  useEffect(() => {
    if (!visible) return;
    const handler = () => measureTarget(current);
    window.addEventListener('resize', handler, { passive: true });
    window.addEventListener('scroll', handler, { passive: true, capture: true });
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, { capture: true });
    };
  }, [current, visible, measureTarget]);

  // Focus the tooltip on step change for keyboard accessibility
  useEffect(() => {
    if (visible && tooltipRef.current) {
      tooltipRef.current.focus();
    }
  }, [current, visible]);

  // Keyboard nav — must be stable reference (no dep array) to always see latest state
  useEffect(() => {
    if (!visible) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') finish('skip');
      if (e.key === 'ArrowRight') advance();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  });

  function advance() {
    const next = current + 1;
    if (next >= steps.length) {
      finish('complete');
    } else {
      setCurrent(next);
    }
  }

  function finish(_reason: 'complete' | 'skip') {
    localStorage.setItem(storageKey, 'done');
    setVisible(false);
    onDone?.();
  }

  if (!mounted || !visible) return null;

  const step = steps[current];
  const PAD = 8;

  return createPortal(
    <>
      {/* Spotlight overlay */}
      <div className="fixed inset-0 z-[9998] pointer-events-none" aria-hidden="true">
        {rect ? (
          <div
            style={{
              position: 'absolute',
              top: rect.top - PAD + window.scrollY,
              left: rect.left - PAD + window.scrollX,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              borderRadius: 10,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.62)',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-black/60" />
        )}
      </div>

      {/* Click backdrop to advance */}
      <div
        className="fixed inset-0 z-[9999] cursor-pointer"
        onClick={advance}
        aria-hidden="true"
      />

      {/* Tooltip */}
      <TourTooltip
        ref={tooltipRef}
        step={step}
        current={current}
        total={steps.length}
        rect={rect}
        onNext={advance}
        onSkip={() => finish('skip')}
      />
    </>,
    document.body,
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function inferPlacement(rect: DOMRect): 'top' | 'bottom' | 'left' | 'right' {
  const { top, bottom, left, right } = rect;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const spaceBottom = vh - bottom;
  const spaceTop = top;
  const spaceRight = vw - right;
  const spaceLeft = left;
  const max = Math.max(spaceBottom, spaceTop, spaceRight, spaceLeft);
  if (max === spaceBottom) return 'bottom';
  if (max === spaceTop) return 'top';
  if (max === spaceRight) return 'right';
  return 'left';
}
