import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaClient, Offer, OfferStatus } from '@prisma/client';
import { OfferNotEditableError } from '../../../common/errors/domain.errors';
import { CreateOfferDto } from '../dto/create-offer.dto';
import { UpdateOfferDto } from '../dto/update-offer.dto';
import { SetRecipientDto } from '../dto/set-recipient.dto';
import { AddDocumentDto } from '../dto/add-document.dto';
import { DealEventService } from '../../deal-events/deal-events.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimelineEvent {
  event: string;       // machine-readable event identifier
  label: string;       // human-readable label for the UI
  timestamp: string | null;  // ISO 8601 — null if not yet reached
  pending: boolean;    // true = step has not occurred yet
}

// ─── OffersService ─────────────────────────────────────────────────────────────
// CRUD + lifecycle for the sender-side offer flow.
//
// Invariants enforced here:
//   - Only DRAFT offers can be mutated (title, message, expiresAt, recipient, docs)
//   - OfferNotEditableError is thrown if the offer is not in DRAFT — callers do
//     NOT need to check status before calling update methods
//   - Offer access is always scoped to the caller's organizationId

const EDITABLE_STATUSES: OfferStatus[] = ['DRAFT'];

@Injectable()
export class OffersService {
  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    private readonly dealEventService: DealEventService,
  ) {}

  // ── Read ──────────────────────────────────────────────────────────────────

  async findOne(offerId: string, orgId: string) {
    const offer = await this.db.offer.findFirst({
      where: { id: offerId, organizationId: orgId, deletedAt: null },
      include: {
        recipient: true,
        documents: { orderBy: { createdAt: 'asc' } },
        snapshot: { include: { documents: true } },
      },
    });
    if (!offer) throw new NotFoundException('Offer not found.');
    return offer;
  }

  async list(orgId: string, page: number, pageSize: number) {
    const [data, total] = await this.db.$transaction([
      this.db.offer.findMany({
        where: { organizationId: orgId, deletedAt: null },
        include: { recipient: true, _count: { select: { documents: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.offer.count({
        where: { organizationId: orgId, deletedAt: null },
      }),
    ]);
    return { data, total, page, pageSize };
  }

  // ── Draft creation ────────────────────────────────────────────────────────

  async create(orgId: string, userId: string, dto: CreateOfferDto) {
    const offer = await this.db.$transaction(async (tx) => {
      const created = await tx.offer.create({
        data: {
          organizationId: orgId,
          createdById: userId,
          title: dto.title,
          message: dto.message ?? null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
      });

      if (dto.recipient) {
        await tx.offerRecipient.create({
          data: {
            offerId: created.id,
            email: dto.recipient.email,
            name: dto.recipient.name,
            // Placeholder hashes — replaced atomically at send time with real token
            tokenHash: `draft_${created.id}`,
            tokenExpiresAt: new Date(0), // invalid until send
          },
        });
      }

      return created;
    });

    void this.dealEventService.emit(offer.id, 'deal_created');
    return offer;
  }

  // ── Draft editing (DRAFT-only mutations) ───────────────────────────────────

  async update(offerId: string, orgId: string, dto: UpdateOfferDto) {
    const offer = await this.requireDraft(offerId, orgId);
    return this.db.offer.update({
      where: { id: offer.id },
      data: {
        title: dto.title !== undefined ? dto.title : undefined,
        message: dto.message !== undefined ? dto.message : undefined,
        expiresAt: dto.expiresAt !== undefined ? new Date(dto.expiresAt) : undefined,
      },
      include: { recipient: true, documents: true },
    });
  }

  async setRecipient(offerId: string, orgId: string, dto: SetRecipientDto) {
    const offer = await this.requireDraft(offerId, orgId);

    const existing = await this.db.offerRecipient.findUnique({
      where: { offerId: offer.id },
    });

    if (existing) {
      return this.db.offerRecipient.update({
        where: { offerId: offer.id },
        data: { email: dto.email, name: dto.name },
      });
    }

    return this.db.offerRecipient.create({
      data: {
        offerId: offer.id,
        email: dto.email,
        name: dto.name,
        tokenHash: `draft_${offer.id}`,
        tokenExpiresAt: new Date(0),
      },
    });
  }

  async addDocument(offerId: string, orgId: string, dto: AddDocumentDto) {
    await this.requireDraft(offerId, orgId);
    return this.db.offerDocument.create({
      data: {
        offerId,
        filename: dto.filename,
        storageKey: dto.storageKey,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        sha256Hash: dto.sha256Hash,
      },
    });
  }

  async removeDocument(offerId: string, orgId: string, documentId: string) {
    await this.requireDraft(offerId, orgId);
    const doc = await this.db.offerDocument.findFirst({
      where: { id: documentId, offerId },
    });
    if (!doc) throw new NotFoundException('Document not found.');
    await this.db.offerDocument.delete({ where: { id: documentId } });
  }

  // ── Timeline ──────────────────────────────────────────────────────────────
  // Returns an ordered list of lifecycle events for a single deal.
  // Pending steps (not yet reached) are included with timestamp: null and pending: true.
  //
  // Dual-path strategy:
  //   - If DealEvents exist for this deal → use them as the source of truth.
  //   - If not → fall back to the DB-state inference path (for pre-migration deals).

  async getTimeline(offerId: string, orgId: string): Promise<TimelineEvent[]> {
    const offer = await this.db.offer.findFirst({
      where: { id: offerId, organizationId: orgId, deletedAt: null },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        recipient: { select: { viewedAt: true } },
        snapshot: { select: { id: true, frozenAt: true } },
      },
    });
    if (!offer) throw new NotFoundException('Offer not found.');

    // ── Dual-path: prefer DealEvents when available ────────────────────────────
    const dealEvents = await this.dealEventService.getForDeal(offerId);
    if (dealEvents.length > 0) {
      return this.buildTimelineFromDealEvents(dealEvents, offer.status);
    }

    // ── Fallback: DB-state inference (pre-migration deals) ─────────────────────
    const events: TimelineEvent[] = [];
    const isDraft = !offer.snapshot;

    // 1. Created — always present
    events.push({ event: 'deal_created', label: 'Deal created', timestamp: offer.createdAt.toISOString(), pending: false });

    if (isDraft) {
      // Show pending future steps for drafts
      events.push({ event: 'deal_sent',     label: 'Deal sent',            timestamp: null, pending: true });
      events.push({ event: 'deal_opened',   label: 'Opened by recipient',  timestamp: null, pending: true });
      events.push({ event: 'otp_verified',  label: 'Identity verified',    timestamp: null, pending: true });
      events.push({ event: 'deal_accepted', label: 'Deal accepted',        timestamp: null, pending: true });
      return events;
    }

    // 2. Sent — snapshot.frozenAt is the authoritative sent timestamp
    events.push({ event: 'deal_sent', label: 'Deal sent', timestamp: offer.snapshot!.frozenAt.toISOString(), pending: false });

    // Fetch additional data in parallel
    const [acceptanceRecord, session, cert] = await Promise.all([
      this.db.acceptanceRecord.findFirst({
        where: { snapshotId: offer.snapshot!.id },
        select: { acceptedAt: true },
      }),
      this.db.signingSession.findFirst({
        where: { offerId, status: { in: ['OTP_VERIFIED', 'ACCEPTED'] } },
        orderBy: { otpVerifiedAt: 'desc' },
        select: { otpVerifiedAt: true },
      }),
      this.db.acceptanceCertificate.findUnique({
        where: { offerId },
        select: { issuedAt: true },
      }),
    ]);

    const viewedAt = offer.recipient?.viewedAt;
    const status = offer.status;

    // 3. Opened
    if (viewedAt) {
      events.push({ event: 'deal_opened', label: 'Opened by recipient', timestamp: viewedAt.toISOString(), pending: false });
    } else if (status === 'SENT') {
      events.push({ event: 'deal_opened', label: 'Opened by recipient', timestamp: null, pending: true });
    }

    if (status === 'ACCEPTED') {
      // 4. OTP verified
      events.push({
        event: 'otp_verified',
        label: 'Identity verified',
        timestamp: session?.otpVerifiedAt?.toISOString() ?? null,
        pending: !session?.otpVerifiedAt,
      });
      // 5. Accepted
      events.push({
        event: 'deal_accepted',
        label: 'Deal accepted',
        timestamp: acceptanceRecord?.acceptedAt.toISOString() ?? null,
        pending: !acceptanceRecord,
      });
      // 6. Certificate
      events.push({
        event: 'certificate_issued',
        label: 'Certificate generated',
        timestamp: cert?.issuedAt.toISOString() ?? null,
        pending: !cert,
      });
    } else if (status === 'DECLINED') {
      events.push({ event: 'deal_declined', label: 'Deal declined', timestamp: offer.updatedAt.toISOString(), pending: false });
    } else if (status === 'EXPIRED') {
      events.push({ event: 'deal_expired', label: 'Deal expired', timestamp: offer.updatedAt.toISOString(), pending: false });
    } else if (status === 'REVOKED') {
      events.push({ event: 'deal_revoked', label: 'Deal revoked', timestamp: offer.updatedAt.toISOString(), pending: false });
    } else if (status === 'SENT') {
      // Still waiting — show pending steps
      events.push({ event: 'otp_verified',  label: 'Identity verified', timestamp: null, pending: true });
      events.push({ event: 'deal_accepted', label: 'Deal accepted',     timestamp: null, pending: true });
    }

    return events;
  }

  // Builds a timeline from DealEvent rows (new-path, post-migration deals).
  // Appends pending future steps based on the current offer status.
  private buildTimelineFromDealEvents(
    dealEvents: Array<{ eventType: string; createdAt: Date }>,
    status: string,
  ): TimelineEvent[] {
    const recorded: TimelineEvent[] = dealEvents.map((e) => ({
      event: e.eventType,
      label: DealEventService.labelFor(e.eventType as Parameters<typeof DealEventService.labelFor>[0]),
      timestamp: e.createdAt.toISOString(),
      pending: false,
    }));

    // Append pending future steps when still in-flight
    const hasEvent = (type: string) => recorded.some((e) => e.event === type);

    if (status === 'SENT') {
      if (!hasEvent('deal_opened'))   recorded.push({ event: 'deal_opened',   label: 'Opened by recipient', timestamp: null, pending: true });
      if (!hasEvent('otp_verified'))  recorded.push({ event: 'otp_verified',  label: 'Identity verified',   timestamp: null, pending: true });
      if (!hasEvent('deal_accepted')) recorded.push({ event: 'deal_accepted', label: 'Deal accepted',        timestamp: null, pending: true });
    } else if (status === 'ACCEPTED' && !hasEvent('certificate_issued')) {
      recorded.push({ event: 'certificate_issued', label: 'Certificate generated', timestamp: null, pending: true });
    }

    return recorded;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  // Load offer and assert it is in DRAFT. Throws OfferNotEditableError if not.
  async requireDraft(offerId: string, orgId: string): Promise<Offer> {
    const offer = await this.db.offer.findFirst({
      where: { id: offerId, organizationId: orgId, deletedAt: null },
    });
    if (!offer) throw new NotFoundException('Offer not found.');
    if (!EDITABLE_STATUSES.includes(offer.status)) {
      throw new OfferNotEditableError(offer.status);
    }
    return offer;
  }
}
