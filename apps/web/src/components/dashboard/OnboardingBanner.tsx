'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

// ─── Step definition ───────────────────────────────────────────────────────────

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  href: string;
  cta: string;
}

const STEPS: OnboardingStep[] = [
  {
    id: 'verify-email',
    label: 'Verify your email',
    description: 'Confirm your email address so customers trust your deals.',
    href: '/dashboard/settings/account',
    cta: 'Verify now →',
  },
  {
    id: 'create-offer',
    label: 'Create your first deal',
    description: 'Draft a deal with your terms and customer details.',
    href: '/dashboard/offers/new',
    cta: 'Create deal →',
  },
  {
    id: 'send-offer',
    label: 'Send the deal',
    description: 'Send the deal to your customer via secure link.',
    href: '/dashboard/offers',
    cta: 'View deals →',
  },
  {
    id: 'get-signature',
    label: 'Get it signed',
    description: 'Your customer signs and a tamper-proof certificate is issued.',
    href: '/dashboard/offers',
    cta: 'View deals →',
  },
];

const STORAGE_KEY = 'oa_onboarding_v1';

// ─── Persistence helpers ────────────────────────────────────────────────────────

function loadCompleted(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveCompleted(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore storage errors
  }
}

// ─── OnboardingBanner ──────────────────────────────────────────────────────────

interface Props {
  /** Override which steps are complete (e.g. from API). Others persist in localStorage. */
  completedStepIds?: string[];
  /** Called when user dismisses the banner entirely. */
  onDismiss?: () => void;
  tourId?: string;
}

export function OnboardingBanner({ completedStepIds = [], onDismiss, tourId }: Props) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Hydrate from localStorage on mount (avoids SSR mismatch)
  useEffect(() => {
    const stored = loadCompleted();
    const merged = new Set([...stored, ...completedStepIds]);
    setCompleted(merged);
    setDismissed(localStorage.getItem(`${STORAGE_KEY}_dismissed`) === '1');
    setMounted(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge incoming API completions
  useEffect(() => {
    if (!mounted) return;
    setCompleted((prev) => {
      const next = new Set([...prev, ...completedStepIds]);
      saveCompleted(next);
      return next;
    });
  }, [completedStepIds, mounted]);

  function markComplete(id: string) {
    setCompleted((prev) => {
      const next = new Set([...prev, id]);
      saveCompleted(next);
      return next;
    });
  }

  function handleDismiss() {
    localStorage.setItem(`${STORAGE_KEY}_dismissed`, '1');
    setDismissed(true);
    onDismiss?.();
  }

  if (!mounted || dismissed || completed.size >= STEPS.length) return null;

  const pct = Math.round((completed.size / STEPS.length) * 100);
  const nextStep = STEPS.find((s) => !completed.has(s.id));

  return (
    <section
      className="bg-white rounded-xl border border-blue-100 p-5 animate-fade-in"
      aria-labelledby="onboarding-heading"
      {...(tourId ? { 'data-tour': tourId } : {})}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 id="onboarding-heading" className="text-sm font-semibold text-gray-900">
            Get started with OfferAccept
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {completed.size} of {STEPS.length} steps complete
          </p>
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss onboarding checklist"
          className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Onboarding progress: ${pct}%`}
        className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-4"
      >
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Steps */}
      <ol className="flex flex-col gap-2" aria-label="Onboarding steps">
        {STEPS.map((step, idx) => {
          const done = completed.has(step.id);
          const isCurrent = step === nextStep;
          return (
            <li
              key={step.id}
              className={cn(
                'flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors',
                isCurrent ? 'bg-blue-50 border border-blue-100' : '',
              )}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {/* Step number / checkmark */}
              <span
                className={cn(
                  'flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5',
                  done
                    ? 'bg-green-500 text-white'
                    : isCurrent
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-400',
                )}
                aria-hidden="true"
              >
                {done ? (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15 3.293 9.879a1 1 0 011.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className={cn('text-xs font-semibold', done ? 'text-gray-400 line-through' : 'text-gray-900')}>
                  {step.label}
                </p>
                {isCurrent && (
                  <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
                )}
              </div>

              {/* CTA */}
              {isCurrent && (
                <Link
                  href={step.href}
                  onClick={() => markComplete(step.id)}
                  className={cn(
                    'flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-md transition-colors whitespace-nowrap',
                    'bg-blue-600 text-white hover:bg-blue-700',
                    'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
                  )}
                >
                  {step.cta}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
