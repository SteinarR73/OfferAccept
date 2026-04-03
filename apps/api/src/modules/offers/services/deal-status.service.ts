import { Injectable } from '@nestjs/common';
import { DealEventService, DealEventType } from '../../deal-events/deal-events.service';

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Computed status derived from the latest DealEvent.
 * Maps directly to the highest-significance event type observed.
 */
export type DealComputedStatus =
  | 'CREATED'
  | 'SENT'
  | 'OPENED'
  | 'OTP_STARTED'
  | 'OTP_VERIFIED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'REVOKED';

/**
 * Highest recipient-activity level observed, derived from events.
 * Progresses monotonically: never_opened → opened → viewed_document → otp_started → otp_verified → accepted
 */
export type RecipientActivity =
  | 'never_opened'
  | 'opened'
  | 'viewed_document'
  | 'otp_started'
  | 'otp_verified'
  | 'accepted';

/**
 * Deterministic recommended next action for the sender.
 */
export type RecommendedAction =
  | 'SEND_REMINDER'      // Sent but never opened after 24h
  | 'FOLLOW_UP'          // Opened but no OTP attempt after 24h
  | 'CHECK_WITH_RECIPIENT' // OTP verified but not accepted after 6h
  | 'NONE';              // Terminal state or too early to act

export interface DealStatusResult {
  /** Derived status from most recent significant event */
  status: DealComputedStatus;
  /** The most recent event type (or null if no events) */
  lastEvent: DealEventType | null;
  /** ISO timestamp of the most recent event (or null) */
  lastActivityAt: string | null;
  /** Highest recipient engagement level observed */
  recipientActivity: RecipientActivity;
  /** What the sender should do next */
  recommendedAction: RecommendedAction;
  /** Human-readable insight strings for the UI */
  insights: string[];
}

// ─── Event type → computed status mapping ─────────────────────────────────────

const EVENT_TO_STATUS: Record<DealEventType, DealComputedStatus> = {
  'deal_created':        'CREATED',
  'deal_sent':           'SENT',
  'deal_opened':         'OPENED',
  'otp_verified':        'OTP_VERIFIED',
  'deal_accepted':       'ACCEPTED',
  'certificate_issued':  'ACCEPTED',   // same phase as accepted
  'deal_reminder_sent':  'SENT',        // still in SENT phase
  'deal_revoked':        'REVOKED',
  'deal_expired':        'EXPIRED',
  'deal_declined':       'DECLINED',
};

// Status precedence — higher = more significant
const STATUS_RANK: Record<DealComputedStatus, number> = {
  CREATED:      0,
  SENT:         1,
  OPENED:       2,
  OTP_STARTED:  3,
  OTP_VERIFIED: 4,
  ACCEPTED:     5,
  DECLINED:     6,
  EXPIRED:      7,
  REVOKED:      8,
};

const TERMINAL_STATUSES = new Set<DealComputedStatus>([
  'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED',
]);

// ─── DealStatusService ─────────────────────────────────────────────────────────
// Computes derived intelligence about a deal from its DealEvent log.
// All computation is deterministic and read-only — no side effects.

@Injectable()
export class DealStatusService {
  constructor(private readonly dealEventService: DealEventService) {}

  /**
   * Compute derived deal status intelligence from the deal's event log.
   * The dealId is assumed to be already verified as org-scoped by the caller.
   */
  async getDealStatus(dealId: string): Promise<DealStatusResult> {
    const events = await this.dealEventService.getForDeal(dealId);

    if (events.length === 0) {
      return {
        status: 'CREATED',
        lastEvent: null,
        lastActivityAt: null,
        recipientActivity: 'never_opened',
        recommendedAction: 'NONE',
        insights: ['No activity recorded yet.'],
      };
    }

    const lastEvent = events[events.length - 1];
    const lastActivityAt = lastEvent.createdAt.toISOString();
    const lastEventType = lastEvent.eventType as DealEventType;

    // Compute highest-rank status from all events
    let status: DealComputedStatus = 'CREATED';
    for (const ev of events) {
      const mapped = EVENT_TO_STATUS[ev.eventType as DealEventType];
      if (mapped && STATUS_RANK[mapped] > STATUS_RANK[status]) {
        status = mapped;
      }
    }

    const recipientActivity = this.computeRecipientActivity(events.map(e => e.eventType as DealEventType));
    const now = new Date();
    const recommendedAction = this.computeRecommendedAction(status, events, now);
    const insights = this.buildInsights(status, events, recipientActivity, lastActivityAt, now);

    return { status, lastEvent: lastEventType, lastActivityAt, recipientActivity, recommendedAction, insights };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private computeRecipientActivity(eventTypes: DealEventType[]): RecipientActivity {
    if (eventTypes.includes('deal_accepted'))  return 'accepted';
    if (eventTypes.includes('otp_verified'))   return 'otp_verified';
    if (eventTypes.includes('deal_opened'))    return 'opened';
    return 'never_opened';
  }

  private computeRecommendedAction(
    status: DealComputedStatus,
    events: Array<{ eventType: string; createdAt: Date }>,
    now: Date,
  ): RecommendedAction {
    if (TERMINAL_STATUSES.has(status)) return 'NONE';

    const sentAt = events.find(e => e.eventType === 'deal_sent')?.createdAt;
    const openedAt = events.find(e => e.eventType === 'deal_opened')?.createdAt;
    const otpVerifiedAt = events.find(e => e.eventType === 'otp_verified')?.createdAt;

    const hoursSince = (date: Date) => (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    // OTP verified but not yet accepted after 6 hours
    if (otpVerifiedAt && !TERMINAL_STATUSES.has(status) && hoursSince(otpVerifiedAt) > 6) {
      return 'CHECK_WITH_RECIPIENT';
    }

    // Opened but no OTP attempt after 24 hours
    if (openedAt && status === 'OPENED' && hoursSince(openedAt) > 24) {
      return 'FOLLOW_UP';
    }

    // Sent but never opened after 24 hours
    if (sentAt && status === 'SENT' && hoursSince(sentAt) > 24) {
      return 'SEND_REMINDER';
    }

    return 'NONE';
  }

  private buildInsights(
    status: DealComputedStatus,
    events: Array<{ eventType: string; createdAt: Date }>,
    recipientActivity: RecipientActivity,
    lastActivityAt: string,
    now: Date,
  ): string[] {
    const insights: string[] = [];
    const sentAt = events.find(e => e.eventType === 'deal_sent')?.createdAt;
    const openedAt = events.find(e => e.eventType === 'deal_opened')?.createdAt;
    const otpVerifiedAt = events.find(e => e.eventType === 'otp_verified')?.createdAt;
    const reminderCount = events.filter(e => e.eventType === 'deal_reminder_sent').length;

    const hoursSince = (date: Date) => Math.round((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    const daysSince = (date: Date) => Math.round((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    switch (status) {
      case 'ACCEPTED':
        insights.push('Deal accepted — certificate generated.');
        break;

      case 'DECLINED':
        insights.push('Recipient declined this deal.');
        break;

      case 'REVOKED':
        insights.push('This deal was revoked and the signing link is no longer valid.');
        break;

      case 'EXPIRED':
        insights.push('This deal has expired. You can create a new deal to re-send.');
        break;

      case 'OTP_VERIFIED':
        if (otpVerifiedAt) {
          const h = hoursSince(otpVerifiedAt);
          insights.push(`Recipient verified their identity ${h < 1 ? 'less than 1 hour' : `${h} hour${h === 1 ? '' : 's'}`} ago.`);
          if (h > 6) {
            insights.push('They have not completed acceptance — consider reaching out.');
          }
        }
        break;

      case 'OPENED':
        if (openedAt) {
          const h = hoursSince(openedAt);
          insights.push(`Recipient opened the deal ${h < 1 ? 'less than 1 hour' : `${h} hour${h === 1 ? '' : 's'}`} ago.`);
          if (h > 24) {
            insights.push('No further action from recipient after 24 hours.');
          }
        }
        break;

      case 'SENT':
        if (sentAt) {
          const d = daysSince(sentAt);
          insights.push(
            `Deal sent ${d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} ago`} — not yet opened.`,
          );
          if (d >= 1) {
            insights.push('Consider sending a reminder.');
          }
        }
        break;

      case 'CREATED':
        insights.push('Deal created but not yet sent.');
        break;
    }

    if (reminderCount > 0) {
      insights.push(`${reminderCount} reminder${reminderCount === 1 ? '' : 's'} sent so far.`);
    }

    return insights;
  }
}
