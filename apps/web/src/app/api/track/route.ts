/**
 * POST /api/track
 *
 * Privacy-safe telemetry receiver. Accepts structured events from the frontend,
 * validates them, and writes to the server log. No PII is written; no external
 * service is called.
 *
 * This is intentionally minimal — the route establishes the architecture so that
 * a telemetry backend (PostHog self-hosted, Prometheus push, etc.) can be wired
 * in later without touching client code.
 */

import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_EVENTS = new Set([
  'recipient.link_opened',
  'recipient.otp_requested',
  'recipient.otp_verified',
  'recipient.otp_failed',
  'recipient.otp_locked',
  'recipient.accepted',
  'recipient.declined',
  'recipient.invalid_link',
  'recipient.link_expired',
  'recipient.already_accepted',
  'demo.started',
  'demo.otp_submitted',
  'demo.statement_viewed',
  'demo.completed',
  'demo.signup_clicked',
  'demo.verify_clicked',
  'onboarding.modal_shown',
  'onboarding.modal_step',
  'onboarding.modal_dismissed',
  'onboarding.modal_completed',
  'onboarding.try_yourself_clicked',
  'onboarding.send_first_clicked',
]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.event !== 'string') {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const { event, properties, ts } = body as {
      event: string;
      properties?: Record<string, unknown>;
      ts?: number;
    };

    // Reject unknown event types
    if (!ALLOWED_EVENTS.has(event)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Strip any PII that may have slipped through (belt-and-suspenders)
    const safeProps = sanitize(properties ?? {});

    // Structured log — picked up by whatever logging infra is in place
    console.log(
      JSON.stringify({
        type: 'telemetry',
        event,
        locale: safeProps.locale ?? 'en',
        device: safeProps.device,
        step: safeProps.step,
        ts: ts ?? Date.now(),
      }),
    );

    return NextResponse.json({ ok: true });
  } catch {
    // Never return a 5xx to the client — telemetry must be silent on failure
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

function sanitize(props: Record<string, unknown>): Record<string, string | number | boolean> {
  const PII_PATTERNS = [/email/i, /name/i, /phone/i, /address/i, /ip/i];
  return Object.fromEntries(
    Object.entries(props)
      .filter(([k]) => !PII_PATTERNS.some((p) => p.test(k)))
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      .map(([k, v]) => [k, v as string | number | boolean]),
  );
}
