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

// The evidence model version identifies the hash algorithm, canonical hash spec,
// and event chain verification protocol in use. Increment only on breaking changes.
// Version history: 1.0 — initial specification (docs/security/evidence-model.md)
const EVIDENCE_MODEL_VERSION = '1.0' as const;

// ─── CertificateMetadata ──────────────────────────────────────────────────────
// Legal and trust-layer versions returned OUTSIDE the hashed CertificatePayload
// to preserve backward compatibility with all existing certificate hashes.
//
// Version resolution rules (authoritative sources):
//   termsVersionAtCreation      — Offer.termsVersionAtCreation, persisted when the
//                                  deal was created. Null for pre-migration offers.
//   acceptanceStatementVersion  — AcceptanceRecord.acceptanceStatementVersion,
//                                  persisted at acceptance time. Null for legacy records.
//   evidenceModelVersion        — static EVIDENCE_MODEL_VERSION constant; identifies
//                                  the hash algorithm and event chain spec in use.
//                                  Not stored per-certificate; always the current spec.
export interface CertificateMetadata {
  termsVersionAtCreation:     string | null;
  acceptanceStatementVersion: string | null;
  evidenceModelVersion:       string;
}

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
  // ── Top-level validity ────────────────────────────────────────────────────
  // Strict invariant: valid === (integrityChecksPass && advisoryAnomalies.length === 0)
  // true ONLY when every cryptographic check passes AND no advisory anomalies exist.
  // Callers that only check `valid` are correct: a legacy cert without canonicalHash
  // returns valid=false so it is never silently treated as fully trusted.
  valid: boolean;
  certificateId: string;

  // ── Integrity summary ─────────────────────────────────────────────────────
  // True when all cryptographic checks pass (hash, canonical, snapshot, chain).
  // May be true while valid=false when advisory anomalies (e.g. LEGACY_CERTIFICATE)
  // are present but no actual tampering is detected.
  // Use this to distinguish "crypto intact but incomplete guarantees" from
  // "evidence of tampering" — the distinction matters for legacy certificate UI.
  integrityChecksPass: boolean;

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

  // ── Statement hash check ─────────────────────────────────────────────────
  // SHA-256 of the acceptance statement text, stored in the OFFER_ACCEPTED
  // event payload at acceptance time. Undefined for events that pre-date this
  // field (acceptanceStatementHash not present in legacy event payloads).
  statementHashMatch?: boolean;

  // ── Snapshot integrity ────────────────────────────────────────────────────
  // OfferSnapshot.contentHash is recomputed from raw OfferSnapshotDocument rows.
  // Detects tampering with the frozen offer content independent of the certificate.
  snapshotIntegrity: boolean;

  // ── Signing event chain ───────────────────────────────────────────────────
  // Each event's hash covers its content and the previous event's hash.
  // A broken chain means an event was inserted, deleted, or modified.
  eventChainValid: boolean;
  brokenAtSequence?: number;  // sequence number of the first broken link, if any

  // ── Anomaly lists — split by severity ─────────────────────────────────────
  // integrityAnomalies: tampering signals — any entry here sets integrityChecksPass=false
  // advisoryAnomalies:  informational flags — set valid=false but not integrityChecksPass
  // anomaliesDetected:  union of both; kept for backward compatibility
  integrityAnomalies: string[];
  advisoryAnomalies:  string[];
  anomaliesDetected:  string[];   // === [...integrityAnomalies, ...advisoryAnomalies]

  // ── Legal and trust metadata ──────────────────────────────────────────────
  // Legal document versions governing this certificate. Returned alongside
  // integrity results — not part of the hashed payload (backward compatible).
  metadata: CertificateMetadata;
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

    // ── Gather offerId and snapshotId for the FKs ────────────────────────────
    const record = await this.db.acceptanceRecord.findUniqueOrThrow({
      where: { id: acceptanceRecordId },
      include: { snapshot: { select: { offerId: true } } },
    });

    // Runtime guard: snapshotId must be present on every AcceptanceRecord.
    // This should be structurally impossible given the schema, but an explicit
    // check prevents a silent NULL propagation into the certificate row.
    if (!record.snapshotId) {
      throw new Error(`AcceptanceRecord ${acceptanceRecordId} is missing snapshotId — cannot generate certificate`);
    }

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
          snapshotId: record.snapshotId,
          issuedAt,
        },
      });
      void this.dealEventService.emit(record.snapshot.offerId, 'certificate_issued', { certificateId: cert.id });
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
        id:                         true,
        sessionId:                  true,
        snapshotId:                 true,
        verifiedEmail:              true,
        acceptedAt:                 true,
        ipAddress:                  true,
        userAgent:                  true,
        // Persisted at acceptance time — used for trust-layer metadata only,
        // not for hash recomputation. Null for records created before this field.
        acceptanceStatementVersion: true,
      },
    });

    // ── Fetch offer metadata for trust-layer annotations ─────────────────────
    // termsVersionAtCreation is read from the Offer row (mutable table) solely
    // for the metadata section. It does NOT affect any integrity check — all
    // hash recomputation continues to use immutable tables only.
    const offerMeta = await this.db.offer.findUnique({
      where: { id: cert.offerId },
      select: { termsVersionAtCreation: true },
    });

    const integrityAnomalies: string[] = [];
    const advisoryAnomalies: string[] = [];

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
      integrityAnomalies.push(
        `Certificate hash mismatch: stored hash does not match hash recomputed from evidence. ` +
        `This indicates the certificate record or its source evidence may have been tampered with.`,
      );
    }

    // ── Step 3B / 4B: Canonical acceptance hash ───────────────────────────────
    // Recompute from the independently fetched acceptance record (step 2).
    // When canonicalHash is null the certificate predates this field; an advisory
    // anomaly is recorded but this does not set integrityChecksPass=false.
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
        integrityAnomalies.push(
          `Canonical acceptance hash mismatch: the 5-field acceptance fingerprint ` +
          `(acceptedAt, dealId, ipAddress, recipientEmail, userAgent) does not match ` +
          `the value stored at issuance. Core acceptance evidence may have been altered.`,
        );
      }
    }

    // ── Step 3C / 4C: Snapshot content integrity ──────────────────────────────
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
      integrityAnomalies.push(
        `Snapshot integrity failure: the stored content hash does not match the hash recomputed ` +
        `from the frozen offer documents. The offer content may have been modified after sending.`,
      );
    }

    // ── Step 3D / 4D: Signing event chain ─────────────────────────────────────
    const chainResult = await this.eventService.verifyChain(record.sessionId);

    if (!chainResult.valid) {
      integrityAnomalies.push(
        `Signing event chain broken at sequence ${chainResult.brokenAtSequence}. ` +
        `An event may have been inserted, deleted, or modified.`,
      );
    }

    // ── Step 3E / 4E: Acceptance statement hash ───────────────────────────────
    // Checks whether the acceptance statement stored in AcceptanceRecord matches
    // the hash recorded in the OFFER_ACCEPTED signing event payload.
    // Only performed when the event was recorded after Phase 3 hardening
    // (i.e. acceptanceStatementHash field exists in the event payload).
    // If the field is absent the check is N/A (legacy event) — advisory only.
    let statementHashMatch: boolean | undefined;
    const acceptedEvent = await this.db.signingEvent.findFirst({
      where: { sessionId: record.sessionId, eventType: 'OFFER_ACCEPTED' },
      select: { payload: true },
    });
    if (acceptedEvent) {
      const eventPayload = acceptedEvent.payload as Record<string, unknown> | null;
      const storedStatementHash = eventPayload?.['acceptanceStatementHash'] as string | undefined;
      if (storedStatementHash !== undefined) {
        // Modern event: verify the statement text matches the stored hash.
        const { createHash } = await import('crypto');
        const record2 = await this.db.acceptanceRecord.findUniqueOrThrow({
          where: { id: cert.acceptanceRecordId },
          select: { acceptanceStatement: true },
        });
        const recomputedStatementHash = createHash('sha256')
          .update(record2.acceptanceStatement, 'utf8')
          .digest('hex');
        statementHashMatch = recomputedStatementHash === storedStatementHash;
        if (!statementHashMatch) {
          integrityAnomalies.push(
            `Acceptance statement hash mismatch: the text of the acceptance statement in the ` +
            `acceptance record does not match the hash committed into the signing event chain. ` +
            `The acceptance statement may have been altered after acceptance.`,
          );
        }
      }
    }

    // ── Legacy certificate advisory ───────────────────────────────────────────
    // Certificates issued before canonicalHash was introduced (migration
    // 20260328_certificate_canonical_hash) lack the 5-field fingerprint.
    // This is an advisory condition: the crypto checks that DO exist still pass,
    // but the certificate cannot be fully independently verified by a third party.
    // Advisory anomalies set valid=false but do NOT set integrityChecksPass=false.
    if (cert.canonicalHash === null) {
      advisoryAnomalies.push(
        'LEGACY_CERTIFICATE: This certificate was issued before the canonical acceptance ' +
        'fingerprint was introduced. The 5-field binding (acceptedAt, dealId, ipAddress, ' +
        'recipientEmail, userAgent) cannot be independently verified. ' +
        'All other integrity checks (certificateHash, snapshotIntegrity, eventChain) remain valid.',
      );
    }

    // Canonical hash passes if present and matching, or N/A for legacy certs.
    const canonicalHashOk = canonicalHashMatch !== false; // undefined (legacy) or true
    const integrityChecksPass =
      certificateHashMatch && canonicalHashOk && snapshotIntegrity && chainResult.valid &&
      statementHashMatch !== false; // undefined (legacy) or true
    const anomaliesDetected = [...integrityAnomalies, ...advisoryAnomalies];

    return {
      valid: integrityChecksPass && advisoryAnomalies.length === 0,
      certificateId,
      integrityChecksPass,
      certificateHashMatch,
      reconstructedHash,
      storedHash,
      canonicalHashMatch,
      statementHashMatch,
      snapshotIntegrity,
      eventChainValid: chainResult.valid,
      brokenAtSequence: chainResult.brokenAtSequence,
      integrityAnomalies,
      advisoryAnomalies,
      anomaliesDetected,
      metadata: {
        // termsVersionAtCreation: from the Offer row captured at deal creation.
        // Null means the offer predates the field (migration 20260412_legal_acceptance).
        termsVersionAtCreation:     offerMeta?.termsVersionAtCreation ?? null,
        // acceptanceStatementVersion: from the AcceptanceRecord captured at acceptance.
        // Null means the record predates the field (legacy acceptance).
        acceptanceStatementVersion: record.acceptanceStatementVersion ?? null,
        // evidenceModelVersion: static constant identifying the current hash algorithm
        // and event chain verification spec. Not stored per-certificate.
        evidenceModelVersion:       EVIDENCE_MODEL_VERSION,
      },
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
    metadata: CertificateMetadata;
  }> {
    const cert = await this.db.acceptanceCertificate.findUnique({
      where: { id: certificateId },
      include: {
        offer: { select: { organizationId: true, termsVersionAtCreation: true } },
        acceptanceRecord: { select: { sessionId: true, acceptanceStatementVersion: true } },
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
      metadata: {
        termsVersionAtCreation:     cert.offer.termsVersionAtCreation ?? null,
        acceptanceStatementVersion: cert.acceptanceRecord.acceptanceStatementVersion ?? null,
        evidenceModelVersion:       EVIDENCE_MODEL_VERSION,
      },
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

  // ── Job-internal methods — bypass auth (called from background jobs only) ──────

  // Returns the export payload for a certificate without org authorization.
  // ONLY for use in trusted background job handlers — never in HTTP controllers.
  async getExportForJob(certificateId: string): Promise<{
    certificateId: string;
    certificateHash: string;
    issuedAt: string;
    pdfStorageKey: string | null;
    payload: CertificatePayload;
  }> {
    const cert = await this.db.acceptanceCertificate.findUnique({
      where: { id: certificateId },
      select: { id: true, issuedAt: true, certificateHash: true, pdfStorageKey: true },
    });
    if (!cert) throw new NotFoundException(`Certificate ${certificateId} not found`);

    const built = await this.builder.build(cert.id, certificateId, cert.issuedAt);

    return {
      certificateId: cert.id,
      // Phase 5 (MEDIUM-6): use the recomputed hash from the builder, not the stored value.
      // The stored certificateHash could be stale if the row was tampered with after issuance.
      // The builder recomputes from immutable evidence, so this is always authoritative.
      certificateHash: built.certificateHash,
      issuedAt: cert.issuedAt.toISOString(),
      pdfStorageKey: cert.pdfStorageKey,
      payload: built.payload,
    };
  }

  // Records the S3 key of the pre-generated PDF on the certificate row.
  // Idempotent: safe to call more than once with the same key.
  async setPdfStorageKey(certificateId: string, pdfStorageKey: string): Promise<void> {
    await this.db.acceptanceCertificate.update({
      where: { id: certificateId },
      data: { pdfStorageKey },
    });
  }

  // Returns the pdfStorageKey (or null) after verifying caller has access.
  // Used by CertificatesController to decide whether to serve from S3 or generate on-demand.
  async getPdfStorageKey(
    certificateId: string,
    callerOrgId: string,
    callerRole: string,
  ): Promise<string | null> {
    const cert = await this.db.acceptanceCertificate.findUnique({
      where: { id: certificateId },
      select: { pdfStorageKey: true, offer: { select: { organizationId: true } } },
    });
    if (!cert) throw new NotFoundException('Certificate not found');
    this.assertCanAccess(cert.offer.organizationId, callerOrgId, callerRole);
    return cert.pdfStorageKey;
  }

  private assertCanAccess(resourceOrgId: string, callerOrgId: string, callerRole: string): void {
    if (callerRole === 'INTERNAL_SUPPORT') return;
    if (resourceOrgId !== callerOrgId) {
      throw new ForbiddenException('You do not have access to this certificate.');
    }
  }
}
