import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

// Generates an unguessable certificate ID.
//
// crypto.randomUUID() produces UUID v4: 128 random bits with 6 bits fixed for
// version/variant markers, yielding 122 bits of effective CSPRNG entropy.
// The 2^122 ID space makes enumeration attacks computationally infeasible.
//
// This function is the single place to swap the format (e.g., to nanoid or
// UUIDv7) if requirements change, without touching call sites.
function generateCertificateId(): string {
  return randomUUID();
}
import {
  CertificatePayloadBuilder,
  CertificatePayload,
  computeCanonicalAcceptanceHash,
} from './certificate-payload.builder';
import { SigningEventService } from '../signing/services/signing-event.service';
import { computeSnapshotHash } from '../signing/domain/signing-event.builder';
import { DealEventService } from '../deal-events/deal-events.service';

// ─── CertificateService ────────────────────────────────────────────────────────
// Owns the full certificate lifecycle:
//   1. generateForAcceptance — idempotent; creates AcceptanceCertificate from a
//      completed AcceptanceRecord in one atomic step.
//   2. verify — recomputes the hash from stored evidence and compares; also
//      verifies OfferSnapshot content hash and SigningEvent chain integrity.
//   3. exportPayload — returns the raw CertificatePayload for download/archiving.
//
// Certificate hash determinism:
//   issuedAt is generated ONCE here, stored in the DB, and passed into the
//   builder. Re-running build() with the same issuedAt and the same evidence
//   always produces the same hash.
//
// Verification reads ONLY immutable tables:
//   AcceptanceCertificate, AcceptanceRecord, OfferSnapshot,
//   OfferSnapshotDocument, SigningEvent.
//   Mutable tables (Offer, User, Organization) are never consulted.

export interface VerificationResult {
  // Top-level validity: true only when ALL checks pass.
  valid: boolean;
  certificateId: string;

  // ── Hash check ────────────────────────────────────────────────────────────
  // Reconstructed from stored immutable evidence using the stored issuedAt.
  // Must match the hash that was stored when the certificate was issued.
  certificateHashMatch: boolean;
  reconstructedHash: string;  // hash we recomputed from evidence
  storedHash: string;         // hash stored in AcceptanceCertificate row

  // ── Canonical acceptance hash check ──────────────────────────────────────
  // SHA-256 of the 5-field acceptance fingerprint: acceptedAt, dealId,
  // ipAddress, recipientEmail, userAgent. Undefined for certificates issued
  // before this field was introduced (backward compatibility).
  canonicalHashMatch?: boolean;

  // ── Snapshot integrity ────────────────────────────────────────────────────
  // OfferSnapshot.contentHash is recomputed from raw OfferSnapshotDocument rows.
  // Detects tampering with the frozen offer content independent of the certificate.
  snapshotIntegrity: boolean;

  // ── Signing event chain ───────────────────────────────────────────────────
  // Each event's hash covers its content and the previous event's hash.
  // A broken chain means an event was inserted, deleted, or modified.
  eventChainValid: boolean;
  brokenAtSequence?: number;  // sequence number of the first broken link, if any

  // ── Anomaly summary ───────────────────────────────────────────────────────
  // Human-readable list of all detected problems. Empty when valid=true.
  anomaliesDetected: string[];
}

@Injectable()
export class CertificateService {
  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    private readonly builder: CertificatePayloadBuilder,
    private readonly eventService: SigningEventService,
    private readonly dealEventService: DealEventService,
  ) {}

  // Creates a certificate for an AcceptanceRecord.
  // Idempotent: if a certificate already exists for this record, returns it.
  // The `issuedAt` timestamp is set here, stored in the DB, and passed into the
  // builder so the hash is reproducible from the stored timestamp alone.
  async generateForAcceptance(acceptanceRecordId: string): Promise<{ certificateId: string; certificateHash: string }> {
    // ── Idempotency guard ──────────────────────────────────────────────────────
    const existing = await this.db.acceptanceCertificate.findUnique({
      where: { acceptanceRecordId },
      select: { id: true, certificateHash: true },
    });
    if (existing) {
      return { certificateId: existing.id, certificateHash: existing.certificateHash };
    }

    // ── Gather offerId for the FK ──────────────────────────────────────────────
    const record = await this.db.acceptanceRecord.findUniqueOrThrow({
      where: { id: acceptanceRecordId },
      include: { snapshot: { select: { offerId: true } } },
    });

    const certificateId = generateCertificateId();
    const issuedAt = new Date();

    // ── Build payload (reads immutable evidence from DB) ──────────────────────
    const built = await this.builder.build(acceptanceRecordId, certificateId, issuedAt);

    // ── Canonical acceptance hash (5-field fingerprint) ───────────────────────
    // Re-loads the AcceptanceRecord fields needed for the canonical hash.
    // These are already in scope from the builder's DB read but not returned
    // in BuiltCertificate — load them here to keep the builder interface clean.
    const fullRecord = await this.db.acceptanceRecord.findUniqueOrThrow({
      where: { id: acceptanceRecordId },
      select: {
        verifiedEmail: true,
        acceptedAt: true,
        ipAddress: true,
        userAgent: true,
      },
    });

    const { hash: canonicalHash } = computeCanonicalAcceptanceHash({
      acceptedAt:     fullRecord.acceptedAt.toISOString(),
      dealId:         record.snapshot.offerId,
      ipAddress:      fullRecord.ipAddress,
      recipientEmail: fullRecord.verifiedEmail,
      userAgent:      fullRecord.userAgent,
    });

    // ── Persist certificate ────────────────────────────────────────────────────
    // Guard against the race between the idempotency check above and this create:
    // if two concurrent calls both passed the findUnique check, the second will
    // hit a P2002 unique-constraint violation. Catch it and return the winner's ID.
    try {
      const cert = await this.db.acceptanceCertificate.create({
        data: {
          id: certificateId,
          offerId: record.snapshot.offerId,
          acceptanceRecordId,
          certificateHash: built.certificateHash,
          canonicalHash,
          issuedAt,
        },
      });
      void this.dealEventService.emit(record.snapshot.offerId, 'certificate.issued', { certificateId: cert.id });
      return { certificateId: cert.id, certificateHash: built.certificateHash };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Another process won the race — return their certificate ID and hash.
        const winner = await this.db.acceptanceCertificate.findUniqueOrThrow({
          where: { acceptanceRecordId },
          select: { id: true, certificateHash: true },
        });
        return { certificateId: winner.id, certificateHash: winner.certificateHash };
      }
      throw err;
    }
  }

  // Verifies a stored certificate's full integrity.
  //
  // Verification sequence (matches stated protocol):
  //   1. Retrieve certificate — no JOIN; acceptance record not fetched here.
  //   2. Retrieve acceptance record — explicit, independent DB read using the FK.
  //   3. Recompute all hashes from the independently fetched evidence.
  //   4. Compare each recomputed hash against its stored counterpart.
  //
  // The stored hashes are never treated as authoritative. They are only the
  // comparison target for values derived entirely from source evidence.
  //
  // Three independent recomputation checks:
  //   A. Certificate hash: rebuild payload from AcceptanceRecord + OfferSnapshot +
  //      OfferRecipient, recompute SHA-256, compare to AcceptanceCertificate.certificateHash.
  //   B. Canonical acceptance hash: recompute 5-field fingerprint from AcceptanceRecord
  //      (acceptedAt, dealId, ipAddress, recipientEmail, userAgent), compare to
  //      AcceptanceCertificate.canonicalHash. Skipped for legacy certificates where
  //      canonicalHash is null — the field did not exist at issuance time.
  //   C. Snapshot content integrity: recompute OfferSnapshot.contentHash from raw
  //      OfferSnapshotDocument rows, compare to OfferSnapshot.contentHash.
  //   D. Signing event chain: verify every SigningEvent's hash and previousEventHash
  //      linkage; a broken link indicates insertion, deletion, or modification.
  //
  // All reads use immutable tables only. Never reads Offer, User, or Organization.
  async verify(certificateId: string): Promise<VerificationResult> {
    // ── Step 1: Retrieve certificate ──────────────────────────────────────────
    // No JOIN — the acceptance record is fetched separately in step 2 so that
    // the evidence used for hash recomputation comes from an independent read.
    const cert = await this.db.acceptanceCertificate.findUnique({
      where: { id: certificateId },
    });

    if (!cert) throw new NotFoundException('Certificate not found');

    // ── Step 2: Retrieve acceptance record independently ──────────────────────
    // Using the FK stored in the certificate row. Fetched as a separate query so
    // the evidence is not co-located with the row that holds the stored hash.
    const record = await this.db.acceptanceRecord.findUniqueOrThrow({
      where: { id: cert.acceptanceRecordId },
      select: {
        id:            true,
        sessionId:     true,
        snapshotId:    true,
        verifiedEmail: true,
        acceptedAt:    true,
        ipAddress:     true,
        userAgent:     true,
      },
    });

    const anomalies: string[] = [];

    // ── Step 3A: Recompute certificate hash from evidence ─────────────────────
    // builder.build() performs its own independent reads (AcceptanceRecord,
    // OfferRecipient, OfferSnapshot, OfferSnapshotDocuments). issuedAt is the
    // value stored at issuance — required for deterministic reconstruction.
    const built = await this.builder.build(
      record.id,
      certificateId,
      cert.issuedAt,
    );

    // ── Step 4A: Compare recomputed certificate hash against stored hash ───────
    const reconstructedHash = built.certificateHash;
    const storedHash = cert.certificateHash;
    const certificateHashMatch = reconstructedHash === storedHash;

    if (!certificateHashMatch) {
      anomalies.push(
        `Certificate hash mismatch: stored hash does not match hash recomputed from evidence. ` +
        `This indicates the certificate record or its source evidence may have been tampered with.`,
      );
    }

    // ── Step 3B / 4B: Canonical acceptance hash ───────────────────────────────
    // Recompute from the independently fetched acceptance record (step 2).
    // When canonicalHash is null the certificate predates this field; no stored
    // value exists to compare against so the check does not apply.
    let canonicalHashMatch: boolean | undefined;
    if (cert.canonicalHash !== null) {
      const { hash: recomputedCanonical } = computeCanonicalAcceptanceHash({
        acceptedAt:     record.acceptedAt.toISOString(),
        dealId:         cert.offerId,
        ipAddress:      record.ipAddress,
        recipientEmail: record.verifiedEmail,
        userAgent:      record.userAgent,
      });
      canonicalHashMatch = recomputedCanonical === cert.canonicalHash;

      if (!canonicalHashMatch) {
        anomalies.push(
          `Canonical acceptance hash mismatch: the 5-field acceptance fingerprint ` +
          `(acceptedAt, dealId, ipAddress, recipientEmail, userAgent) does not match ` +
          `the value stored at issuance. Core acceptance evidence may have been altered.`,
        );
      }
    }

    // ── Step 3C / 4C: Snapshot content integrity ──────────────────────────────
    // Load snapshot and raw documents from immutable tables. Recompute the content
    // hash from the documents; compare against the snapshot's stored contentHash.
    // snapshotId comes from the independently fetched record (step 2).
    const snapshot = await this.db.offerSnapshot.findUniqueOrThrow({
      where: { id: record.snapshotId },
      include: { documents: true },
    });

    const recomputedSnapshotHash = computeSnapshotHash({
      title:      snapshot.title,
      message:    snapshot.message,
      senderName: snapshot.senderName,
      senderEmail: snapshot.senderEmail,
      expiresAt:  snapshot.expiresAt?.toISOString() ?? null,
      documents:  snapshot.documents.map((d) => ({
        filename:   d.filename,
        sha256Hash: d.sha256Hash,
        storageKey: d.storageKey,
      })),
    });

    const snapshotIntegrity = recomputedSnapshotHash === snapshot.contentHash;

    if (!snapshotIntegrity) {
      anomalies.push(
        `Snapshot integrity failure: the stored content hash does not match the hash recomputed ` +
        `from the frozen offer documents. The offer content may have been modified after sending.`,
      );
    }

    // ── Step 3D / 4D: Signing event chain ─────────────────────────────────────
    // sessionId comes from the independently fetched record (step 2).
    const chainResult = await this.eventService.verifyChain(record.sessionId);

    if (!chainResult.valid) {
      anomalies.push(
        `Signing event chain broken at sequence ${chainResult.brokenAtSequence}. ` +
        `An event may have been inserted, deleted, or modified.`,
      );
    }

    // canonicalHashMatch === undefined means the certificate predates this field;
    // there is no stored value to compare against, so the check is N/A (not a failure).
    const canonicalHashOk = canonicalHashMatch ?? true;

    return {
      valid: certificateHashMatch && canonicalHashOk && snapshotIntegrity && chainResult.valid,
      certificateId,
      certificateHashMatch,
      reconstructedHash,
      storedHash,
      canonicalHashMatch,
      snapshotIntegrity,
      eventChainValid: chainResult.valid,
      brokenAtSequence: chainResult.brokenAtSequence,
      anomaliesDetected: anomalies,
    };
  }

  // Returns the full certificate payload for the given certificate.
  // Used for JSON export / archiving / third-party independent verification.
  //
  // certificateHash in the response is the value recomputed by the builder from
  // current evidence — not the raw value stored in AcceptanceCertificate. The builder
  // always runs; the stored hash is never passed through as-is.
  //
  // A third party can independently verify by:
  //   1. Receiving this response
  //   2. Computing SHA-256(deepSortKeys(JSON.stringify(payload))) themselves
  //   3. Comparing their result to certificateHash (== canonicalJson hashed)
  //
  // Access control (enforced at service level):
  //   - callerRole === 'INTERNAL_SUPPORT' → always allowed (cross-org support access)
  //   - callerOrgId === offer.organizationId → allowed (own-org access)
  //   - otherwise → ForbiddenException
  //
  // The public /verify endpoint does NOT call this method. It calls verify() which
  // returns only integrity hashes and booleans — no sensitive payload content.
  async exportPayload(
    certificateId: string,
    callerOrgId: string,
    callerRole: string,
  ): Promise<{
    certificateId: string;
    certificateHash: string;
    issuedAt: string;
    payload: CertificatePayload;
    canonicalJson: string;
    eventHistory: Array<{ sequence: number; eventType: string; occurredAt: string }>;
  }> {
    const cert = await this.db.acceptanceCertificate.findUnique({
      where: { id: certificateId },
      include: {
        offer: { select: { organizationId: true } },
        acceptanceRecord: { select: { sessionId: true } },
      },
    });

    if (!cert) throw new NotFoundException('Certificate not found');

    this.assertCanAccess(cert.offer.organizationId, callerOrgId, callerRole);

    const [built, signingEvents] = await Promise.all([
      this.builder.build(cert.acceptanceRecordId, certificateId, cert.issuedAt),
      this.db.signingEvent.findMany({
        where: { sessionId: cert.acceptanceRecord.sessionId },
        select: { sequenceNumber: true, eventType: true, timestamp: true },
        orderBy: { sequenceNumber: 'asc' },
      }),
    ]);

    return {
      certificateId,
      certificateHash: built.certificateHash,  // recomputed from evidence — not the stored value
      issuedAt: cert.issuedAt.toISOString(),
      payload: built.payload,
      canonicalJson: built.canonicalJson,
      eventHistory: signingEvents.map((e) => ({
        sequence: e.sequenceNumber,
        eventType: e.eventType,
        occurredAt: e.timestamp.toISOString(),
      })),
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  // Enforces tenant-scoped access to certificate data.
  // INTERNAL_SUPPORT bypasses the org check — they have explicit cross-tenant access.
  // Any other caller must belong to the same organization that owns the offer.
  // Returns AcceptanceRecord IDs (and their acceptedAt timestamps) for records
  // that have no certificate and were accepted more than `thresholdMs` ago.
  //
  // Used by ReconcileCertificatesHandler to detect and recover from silent
  // certificate generation failures. Only reads two immutable tables.
  // Returns minimal certificate stubs for all org certificates.
  // Used by the bulk-export endpoint — full payload is loaded per-cert inside the loop.
  async listOrgCertificates(orgId: string): Promise<Array<{ id: string }>> {
    return this.db.acceptanceCertificate.findMany({
      where: { offer: { organizationId: orgId } },
      select: { id: true },
      orderBy: { issuedAt: 'asc' },
    });
  }

  async findMissingCertificates(
    thresholdMs: number,
  ): Promise<Array<{ id: string; acceptedAt: Date }>> {
    const cutoff = new Date(Date.now() - thresholdMs);
    return this.db.acceptanceRecord.findMany({
      where: {
        acceptedAt: { lte: cutoff },
        certificate: { is: null },
      },
      select: { id: true, acceptedAt: true },
      orderBy: { acceptedAt: 'asc' },
    });
  }

  private assertCanAccess(resourceOrgId: string, callerOrgId: string, callerRole: string): void {
    if (callerRole === 'INTERNAL_SUPPORT') return;
    if (resourceOrgId !== callerOrgId) {
      throw new ForbiddenException('You do not have access to this certificate.');
    }
  }
}
