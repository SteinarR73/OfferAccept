import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

// ─── DealEventService ──────────────────────────────────────────────────────────
// Append-only lifecycle event log for the deal workflow.
//
// emit() is the only write path — it is intentionally best-effort: it catches
// all errors internally and logs a warning rather than propagating failures.
// Event emission must never break the main lifecycle action (send, accept, etc.).
//
// Usage pattern (in any service):
//   void this.dealEventService.emit(offerId, 'deal_created');
//
// Since DealEventsModule is @Global(), services can inject DealEventService
// without their own module importing DealEventsModule.

export type DealEventType =
  | 'deal_created'
  | 'deal_sent'
  | 'deal_opened'
  | 'otp_verified'
  | 'deal_accepted'
  | 'certificate_generated'
  | 'deal_reminder_sent'
  | 'deal_revoked'
  | 'deal_expired'
  | 'deal_declined';

export interface RecentDealEvent {
  id: string;
  dealId: string;
  dealTitle: string;
  eventType: DealEventType;
  metadata: Record<string, unknown> | null;
  createdAt: string; // ISO 8601
}

const EVENT_LABELS: Record<DealEventType, string> = {
  deal_created:          'Deal created',
  deal_sent:             'Deal sent',
  deal_opened:           'Opened by recipient',
  otp_verified:          'Identity verified',
  deal_accepted:         'Deal accepted',
  certificate_generated: 'Certificate generated',
  deal_reminder_sent:    'Reminder sent',
  deal_revoked:          'Deal revoked',
  deal_expired:          'Deal expired',
  deal_declined:         'Deal declined',
};

@Injectable()
export class DealEventService {
  private readonly logger = new Logger(DealEventService.name);

  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  /**
   * Emit a deal lifecycle event. Best-effort: never throws.
   * Callers should use `void this.dealEventService.emit(...)` for fire-and-forget.
   */
  async emit(
    dealId: string,
    eventType: DealEventType,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.db.dealEvent.create({
        data: { dealId, eventType, metadata: metadata as Prisma.InputJsonObject ?? undefined },
      });
    } catch (e: unknown) {
      this.logger.warn(`Failed to emit ${eventType} for deal ${dealId}: ${e}`);
    }
  }

  /**
   * Returns all events for a single deal, oldest first.
   * Used by getTimeline() to build the per-deal lifecycle view.
   */
  async getForDeal(dealId: string) {
    return this.db.dealEvent.findMany({
      where: { dealId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Returns the most recent events across all deals belonging to an org.
   * Newest first. Used by the activity feed.
   */
  async getRecentForOrg(orgId: string, limit = 20): Promise<RecentDealEvent[]> {
    const rows = await this.db.dealEvent.findMany({
      where: {
        offer: { organizationId: orgId, deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { offer: { select: { title: true } } },
    });

    return rows.map((r) => ({
      id: r.id,
      dealId: r.dealId,
      dealTitle: r.offer.title,
      eventType: r.eventType as DealEventType,
      metadata: r.metadata as Record<string, unknown> | null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Human-readable label for a given event type. */
  static labelFor(eventType: DealEventType): string {
    return EVENT_LABELS[eventType] ?? eventType;
  }
}
