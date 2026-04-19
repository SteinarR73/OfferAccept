'use client';

import React, { useState } from 'react';
import { CheckCircle2, Circle, Clock3, FileCheck2, Mail, ShieldCheck, Copy, ExternalLink, Check } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type LifecycleStepKey =
  | 'sent'
  | 'opened'
  | 'accepted'
  | 'certificate_issued'
  | 'verification_available';

type LifecycleStatus = 'complete' | 'current' | 'upcoming';

export type OfferLifecycleState = {
  sentAt?: string | Date | null;
  openedAt?: string | Date | null;
  acceptedAt?: string | Date | null;
  certificateIssuedAt?: string | Date | null;
  verificationUrl?: string | null;
};

type OfferLifecycleCardProps = {
  title?: string;
  recipientName?: string;
  recipientEmail?: string;
  offerTitle?: string;
  state: OfferLifecycleState;
  className?: string;
};

type StepDefinition = {
  key: LifecycleStepKey;
  label: string;
  description: string;
  /** Shown when this step is the current active step */
  guidance: string;
  icon: React.ComponentType<{ className?: string }>;
};

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEP_DEFINITIONS: StepDefinition[] = [
  {
    key: 'sent',
    label: 'Offer sent',
    description: 'A secure email link was sent to the recipient.',
    guidance: 'Waiting for the recipient to open the offer.',
    icon: Mail,
  },
  {
    key: 'opened',
    label: 'Offer opened',
    description: 'The recipient opened the offer link.',
    guidance: 'Recipient is reviewing the offer.',
    icon: Circle,
  },
  {
    key: 'accepted',
    label: 'Offer accepted',
    description: 'The recipient completed acceptance.',
    guidance: 'Acceptance recorded. Generating certificate…',
    icon: CheckCircle2,
  },
  {
    key: 'certificate_issued',
    label: 'Certificate issued',
    description: 'A tamper-evident certificate was generated.',
    guidance: 'Certificate ready. Enabling public verification…',
    icon: FileCheck2,
  },
  {
    key: 'verification_available',
    label: 'Verification available',
    description: 'This certificate can be verified publicly by any third party.',
    guidance: 'Verification is live.',
    icon: ShieldCheck,
  },
];

// ─── Time helpers ─────────────────────────────────────────────────────────────

function formatRelative(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatAbsolute(date);
}

function formatAbsolute(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// ─── Step logic ───────────────────────────────────────────────────────────────

function getStepStatus(stepKey: LifecycleStepKey, state: OfferLifecycleState): LifecycleStatus {
  const completedMap: Record<LifecycleStepKey, boolean> = {
    sent:                    Boolean(state.sentAt),
    opened:                  Boolean(state.openedAt),
    accepted:                Boolean(state.acceptedAt),
    certificate_issued:      Boolean(state.certificateIssuedAt),
    verification_available:  Boolean(state.verificationUrl),
  };

  if (completedMap[stepKey]) return 'complete';

  const order: LifecycleStepKey[] = [
    'sent', 'opened', 'accepted', 'certificate_issued', 'verification_available',
  ];

  const currentIndex = order.findIndex((key) => !completedMap[key]);
  return order.indexOf(stepKey) === currentIndex ? 'current' : 'upcoming';
}

function getRawTimestamp(stepKey: LifecycleStepKey, state: OfferLifecycleState): string | Date | null {
  switch (stepKey) {
    case 'sent':               return state.sentAt ?? null;
    case 'opened':             return state.openedAt ?? null;
    case 'accepted':           return state.acceptedAt ?? null;
    case 'certificate_issued': return state.certificateIssuedAt ?? null;
    default:                   return null;
  }
}

// ─── Status classes ───────────────────────────────────────────────────────────

function statusClasses(status: LifecycleStatus): {
  dot: string; icon: string; title: string; desc: string; line: string; badge: string;
} {
  switch (status) {
    case 'complete':
      return {
        dot:   'border-(--color-success) bg-(--color-success-soft)',
        icon:  'text-(--color-success)',
        title: 'text-(--color-text-primary)',
        desc:  'text-(--color-text-secondary)',
        line:  'bg-(--color-success)',
        badge: 'bg-(--color-success-soft) text-(--color-success) border border-(--color-success-border)',
      };
    case 'current':
      return {
        dot:   'border-(--color-accent) bg-(--color-accent-soft)',
        icon:  'text-(--color-accent)',
        title: 'text-(--color-text-primary)',
        desc:  'text-(--color-text-secondary)',
        line:  'bg-(--color-border)',
        badge: 'bg-(--color-accent-soft) text-(--color-accent) border border-(--color-accent-light)',
      };
    case 'upcoming':
      return {
        dot:   'border-(--color-border) bg-(--color-surface)',
        icon:  'text-(--color-text-muted)',
        title: 'text-(--color-text-secondary)',
        desc:  'text-(--color-text-muted)',
        line:  'bg-(--color-border)',
        badge: 'bg-(--color-muted-surface) text-(--color-text-muted) border border-(--color-border)',
      };
  }
}

// ─── Copy-link button ─────────────────────────────────────────────────────────

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const absolute = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    navigator.clipboard.writeText(absolute).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
      aria-label="Copy verification link"
    >
      {copied
        ? <><Check className="h-3.5 w-3.5 text-(--color-success)" aria-hidden="true" />Copied</>
        : <><Copy className="h-3.5 w-3.5" aria-hidden="true" />Copy link</>
      }
    </button>
  );
}

// ─── OfferLifecycleCard ───────────────────────────────────────────────────────

export function OfferLifecycleCard({
  title = 'Offer lifecycle',
  recipientName,
  recipientEmail,
  offerTitle,
  state,
  className,
}: OfferLifecycleCardProps) {
  const completedCount = STEP_DEFINITIONS.filter(
    (step) => getStepStatus(step.key, state) === 'complete'
  ).length;

  const progressPercent = Math.round((completedCount / STEP_DEFINITIONS.length) * 100);

  // The single active guidance message — from the first non-complete step
  const currentStep = STEP_DEFINITIONS.find(
    (step) => getStepStatus(step.key, state) === 'current'
  );

  return (
    <section
      className={[
        'rounded-2xl border border-(--color-border) bg-(--color-surface) p-6 shadow-[var(--shadow-card)]',
        'card-hover',
        className ?? '',
      ].join(' ')}
      aria-label="Offer lifecycle"
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 border-b border-(--color-border) pb-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-(--color-text-muted)">
            Lifecycle
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-(--color-text-primary)">
            {title}
          </h2>

          {(offerTitle || recipientName || recipientEmail) && (
            <div className="mt-3 flex flex-col gap-1">
              {offerTitle && (
                <p className="truncate text-sm font-medium text-(--color-text-primary)">
                  {offerTitle}
                </p>
              )}
              {(recipientName || recipientEmail) && (
                <p className="truncate text-sm text-(--color-text-secondary)">
                  {recipientName}
                  {recipientName && recipientEmail ? ' · ' : ''}
                  {recipientEmail}
                </p>
              )}
            </div>
          )}

          {/* Active guidance pill — the key UX addition */}
          {currentStep && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-(--color-accent-soft) border border-(--color-accent-light) px-3 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-(--color-accent) animate-pulse flex-shrink-0" aria-hidden="true" />
              <p className="text-xs font-medium text-(--color-accent-text)">
                {currentStep.guidance}
              </p>
            </div>
          )}

          {/* All complete — final state message */}
          {!currentStep && completedCount === STEP_DEFINITIONS.length && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-(--color-success-soft) border border-(--color-success-border) px-3 py-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-(--color-success) flex-shrink-0" aria-hidden="true" />
              <p className="text-xs font-medium text-(--color-success-text)">
                Acceptance complete — certificate publicly verifiable.
              </p>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="min-w-[160px]">
          <div className="flex items-center justify-between text-xs font-medium text-(--color-text-muted)">
            <span>Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-(--color-muted-surface)"
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Offer lifecycle progress"
          >
            <div
              className="h-full rounded-full bg-(--color-accent) transition-[width] duration-[var(--duration-enter)] ease-[var(--ease-decelerate)]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Steps ──────────────────────────────────────────────────────────── */}
      <ol className="mt-6 space-y-0">
        {STEP_DEFINITIONS.map((step, index) => {
          const status    = getStepStatus(step.key, state);
          const rawTs     = getRawTimestamp(step.key, state);
          const styles    = statusClasses(status);
          const Icon      = step.icon;
          const isLast    = index === STEP_DEFINITIONS.length - 1;

          return (
            <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0">
              {/* Connector line */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[18px] top-10 w-px ${styles.line}`}
                  style={{ height: 'calc(100% - 8px)' }}
                />
              )}

              {/* Step dot */}
              <div className={[
                'relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
                styles.dot,
              ].join(' ')}>
                {status === 'current'
                  ? <Clock3 className={`h-4 w-4 ${styles.icon}`} />
                  : <Icon   className={`h-4 w-4 ${styles.icon}`} />
                }
              </div>

              {/* Step content */}
              <div className="min-w-0 flex-1 pt-0.5">
                {/* Label + badge */}
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={`text-sm font-semibold ${styles.title}`}>{step.label}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles.badge}`}>
                    {status === 'complete' ? 'Complete' : status === 'current' ? 'In progress' : 'Upcoming'}
                  </span>
                </div>

                {/* Description */}
                <p className={`mt-1 text-sm leading-snug ${styles.desc}`}>{step.description}</p>

                {/* Timestamp row — relative + absolute */}
                {rawTs && (
                  <p className="mt-1.5 text-xs text-(--color-text-muted)">
                    <span className="font-medium">{formatRelative(rawTs)}</span>
                    <span className="mx-1.5 opacity-40">·</span>
                    <span>{formatAbsolute(rawTs)}</span>
                  </p>
                )}

                {/* Verification step actions */}
                {step.key === 'verification_available' && state.verificationUrl && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <a
                      href={state.verificationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-(--color-accent) hover:text-(--color-accent-hover) transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      Open verification
                    </a>
                    <span className="w-px h-3 bg-(--color-border)" aria-hidden="true" />
                    <CopyLinkButton url={state.verificationUrl} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default OfferLifecycleCard;
