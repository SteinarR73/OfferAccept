import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaClient, Offer, OfferStatus } from '@prisma/client';
import { OfferNotEditableError } from '../../../common/errors/domain.errors';
import { CreateOfferDto } from '../dto/create-offer.dto';
import { UpdateOfferDto } from '../dto/update-offer.dto';
import { SetRecipientDto } from '../dto/set-recipient.dto';
import { AddDocumentDto } from '../dto/add-document.dto';

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
  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

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
    return this.db.$transaction(async (tx) => {
      const offer = await tx.offer.create({
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
            offerId: offer.id,
            email: dto.recipient.email,
            name: dto.recipient.name,
            // Placeholder hashes — replaced atomically at send time with real token
            tokenHash: `draft_${offer.id}`,
            tokenExpiresAt: new Date(0), // invalid until send
          },
        });
      }

      return offer;
    });
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
