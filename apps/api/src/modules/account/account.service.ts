import { Injectable, Inject, Logger, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// ─── AccountService ────────────────────────────────────────────────────────────
// Handles GDPR-mandated data portability and erasure workflows.
//
// Data export (Art. 20): returns all personal data held for the requesting user.
//
// Erasure request (Art. 17): records a request for deletion and notifies operators.
//   IMPORTANT: Acceptance records (AcceptanceRecord, AcceptanceCertificate,
//   OfferSnapshot, SigningEvent) are immutable. They cannot be deleted or
//   pseudonymised because deletion would invalidate the SHA-256 certificate hash
//   and destroy the tamper-evident evidentiary record. This constraint is
//   documented in the DPA (Clause 9).

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  // ── GDPR Art. 20 — Data portability export ────────────────────────────────
  // Returns all mutable personal data for the requesting user.
  // Excludes: hashed passwords, internal tokens, immutable evidence records.
  async exportData(userId: string, orgId: string) {
    const [user, org, offers, acceptanceRecords] = await Promise.all([
      this.db.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id:            true,
          email:         true,
          name:          true,
          role:          true,
          emailVerified: true,
          createdAt:     true,
          updatedAt:     true,
          // Excluded: hashedPassword (security), deletedAt (internal)
        },
      }),
      this.db.organization.findUnique({
        where: { id: orgId },
        select: {
          id:        true,
          name:      true,
          slug:      true,
          createdAt: true,
        },
      }),
      // Offers created by this user within their organization
      this.db.offer.findMany({
        where: { createdById: userId, organizationId: orgId, deletedAt: null },
        select: {
          id:        true,
          title:     true,
          message:   true,
          status:    true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          recipient: {
            select: {
              email: true,
              name:  true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Acceptance records where this user's organization was the sender.
      // Returns the acceptance evidence (statement, timestamp) — these are
      // read-only; the immutable rows are never modified.
      this.db.acceptanceRecord.findMany({
        where: {
          snapshot: {
            offer: { organizationId: orgId },
          },
        },
        select: {
          id:                 true,
          verifiedEmail:      true,
          acceptedAt:         true,
          acceptanceStatement: true,
          snapshot: {
            select: {
              title:      true,
              senderName: true,
            },
          },
          certificate: {
            select: {
              id:              true,
              certificateHash: true,
              issuedAt:        true,
            },
          },
        },
        orderBy: { acceptedAt: 'desc' },
      }),
    ]);

    this.logger.log(JSON.stringify({
      event:  'gdpr_export',
      userId,
      orgId,
      offerCount:            offers.length,
      acceptanceRecordCount: acceptanceRecords.length,
    }));

    return {
      exportedAt: new Date().toISOString(),
      user,
      organization: org,
      offers,
      acceptanceRecords,
    };
  }

  // ── GDPR Art. 17 — Erasure request ────────────────────────────────────────
  // Records a request and notifies operators via structured log.
  // One pending request per user is allowed — duplicate requests are rejected.
  async requestErasure(userId: string): Promise<{ requestId: string }> {
    // Prevent duplicate pending requests
    const existing = await this.db.erasureRequest.findFirst({
      where: { userId, status: { in: ['PENDING', 'PROCESSING'] } },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        'An erasure request is already pending for this account. ' +
        'Contact privacy@offeraccept.com for status updates.',
      );
    }

    const request = await this.db.erasureRequest.create({
      data: { userId },
      select: { id: true, requestedAt: true },
    });

    // Structured log — operators alert on this event
    this.logger.warn(JSON.stringify({
      event:       'gdpr_erasure_requested',
      requestId:   request.id,
      userId,
      requestedAt: request.requestedAt.toISOString(),
      // Operators should:
      // 1. Delete/anonymise: user account (email, name, hashedPassword)
      // 2. Delete: sessions, email verification tokens, password reset tokens
      // 3. Mark: draft offers as deleted (deletedAt = now)
      // 4. Preserve: AcceptanceRecord, AcceptanceCertificate, OfferSnapshot,
      //    SigningEvent — these are immutable and cannot be removed.
      //    See DPA Clause 9 and docs/operations.md for the rationale.
      operatorAction: 'ERASURE_WORKFLOW_REQUIRED',
    }));

    return { requestId: request.id };
  }
}
