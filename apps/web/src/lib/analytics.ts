/**
 * analytics.ts — lightweight, privacy-safe event tracker.
 *
 * Architecture:
 *   client → POST /api/track (Next.js route handler) → structured log
 *
 * Design decisions:
 *   - Fire-and-forget: never blocks the UI
 *   - No PII: only event type + anonymous metadata
 *   - No external service dependency: all events stay internal
 *   - PostHog-compatible schema: can be forwarded to PostHog later
 *   - sendBeacon for reliability on page transitions
 *
 * Adding new events:
 *   1. Add the event name to EventName below
 *   2. Call track() at the relevant user action
 *   3. Document the event in docs/telemetry-events.md
 */

// ─── Event taxonomy ───────────────────────────────────────────────────────────

export type EventName =
  // Recipient funnel
  | 'recipient.link_opened'
  | 'recipient.otp_requested'
  | 'recipient.otp_verified'
  | 'recipient.otp_failed'
  | 'recipient.otp_locked'
  | 'recipient.accepted'
  | 'recipient.declined'
  | 'recipient.invalid_link'
  | 'recipient.link_expired'
  | 'recipient.already_accepted'
  // Demo funnel
  | 'demo.started'
  | 'demo.otp_submitted'
  | 'demo.statement_viewed'
  | 'demo.completed'
  | 'demo.signup_clicked'
  | 'demo.verify_clicked'
  // Sender activation
  | 'onboarding.modal_shown'
  | 'onboarding.modal_step'
  | 'onboarding.modal_dismissed'
  | 'onboarding.modal_completed'
  | 'onboarding.try_yourself_clicked'
  | 'onboarding.send_first_clicked';

export interface TrackProperties {
  locale?: 'en' | 'no';
  device?: 'mobile' | 'desktop';
  step?: number;
  [key: string]: string | number | boolean | undefined;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fire a telemetry event. Never throws; never blocks.
 * Call from any client component — safe to call during page transitions.
 */
export function track(event: EventName, properties?: TrackProperties): void {
  if (typeof window === 'undefined') return;

  const payload = JSON.stringify({
    event,
    properties: {
      locale: readLocaleCookie(),
      device: window.innerWidth < 768 ? 'mobile' : 'desktop',
      ...properties,
    },
    ts: Date.now(),
  });

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/track', {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Telemetry must never break the product
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readLocaleCookie(): 'en' | 'no' {
  try {
    const match = document.cookie.match(/oa_locale=([^;]+)/);
    return match?.[1] === 'no' ? 'no' : 'en';
  } catch {
    return 'en';
  }
}
