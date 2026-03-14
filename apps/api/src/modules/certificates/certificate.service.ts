import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  CertificatePayloadBuilder,
  CertificatePayload,
  computeCertificateHash,
} from './certificate-payload.builder';
import { SigningEventService } from '../signing/services/signing-event.service';
import { computeSnapshotHash } from '../signing/domain/signing-event.builder';

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
  ) {}

  // Creates a certificate for an AcceptanceRecord.
  // Idempotent: if a certificate already exists for this record, returns it.
  // The `issuedAt` timestamp is set here, stored in the DB, and passed into the
  // builder so the hash is reproducible from the stored timestamp alone.
  async generateForAcceptance(acceptanceRecordId: string): Promise<{ certificateId: string }> {
    // ── Idempotency guard ──────────────────────────────────────────────────────
    const existing = await this.db.acceptanceCertificate.findUnique({
      where: { acceptanceRecordId },
      select: { id: true },
    });
    if (existing) {
      return { certificateId: existing.id };
    }

    // ── Gather offerId for the FK ──────────────────────────────────────────────
    const record = await this.db.acceptanceRecord.findUniqueOrThrow({
      where: { id: acceptanceRecordId },
      include: { snapshot: { select: { offerId: true } } },
    });

    const certificateId = randomUUID();
    const issuedAt = new Date();

    // ── Build payload (reads immutable evidence from DB) ──────────────────────
    const built = await this.builder.build(acceptanceRecordId, certificateId, issuedAt);

    // ── Persist certificate atomically ────────────────────────────────────────
    const cert = await this.db.acceptanceCertificate.create({
      data: {
        id: certificateId,
        offerId: record.snapshot.offerId,
        acceptanceRecordId,
        certificateHash: built.certificateHash,
        issuedAt,
      },
    });

    return { certificateId: cert.id };
  }

  // Verifies a stored certificate's full integrity.
  //
  // Three independent checks:
  //   1. Certificate hash: rebuild payload with stored issuedAt, recompute hash,
  //      compare to stored certificateHash.
  //   2. Snapshot integrity: recompute OfferSnapshot.contentHash from raw
  //      OfferSnapshotDocument rows, compare to stored contentHash.
  //   3. Signing event chain: verify every event's hash and previousEventHash
  //      linkage for the associated signing session.
  //
  // All checks use only immutable tables. Never reads Offer, User, or Organization.
  async verify(certificateId: string): Promise<VerificationResult> {
    const cert = await this.db.acceptanceCertificate.findUnique({
      where: { id: certificateId },
      include: {
        acceptanceRecord: {
          select: { id: true, sessionId: true, snapshotId: true },
        },
      },
    });

    if (!cert) throw new NotFoundException('Certificate not found');

    const anomalies: string[] = [];

    // ── Check 1: Certificate hash ─────────────────────────────────────────────
    const built = await this.builder.build(
      cert.acceptanceRecordId,
      certificateId,
      cert.issuedAt,          // must use stored issuedAt — not new Date()
    );

    const reconstructedHash = built.certificateHash;
    const storedHash = cert.certificateHash;
    const certificateHashMatch = reconstructedHash === storedHash;

    if (!certificateHashMatch) {
      anomalies.push(
        `Certificate hash mismatch: stored hash does not match hash recomputed from evidence. ` +
        `This indicates the certificate record or its source evidence may have been tampered with.`,
      );
    }

    // ── Check 2: Snapshot content integrity ───────────────────────────────────
    // Load the snapshot with its document list from immutable tables.
    // Recompute the content hash independently and compare to snapshot.contentHash.
    const snapshot = await this.db.offerSnapshot.findUniqueOrThrow({
      where: { id: cert.acceptanceRecord.snapshotId },
      include: { documents: true },
    });

    const recomputedSnapshotHash = computeSnapshotHash({
      title: snapshot.title,
      message: snapshot.message,
      senderName: snapshot.senderName,
      senderEmail: snapshot.senderEmail,
      expiresAt: snapshot.expiresAt?.toISOString() ?? null,
      documents: snapshot.documents.map((d) => ({
        filename: d.filename,
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

    // ── Check 3: Signing event chain ──────────────────────────────────────────
    const chainResult = await this.eventService.verifyChain(cert.acceptanceRecord.sessionId);

    if (!chainResult.valid) {
      anomalies.push(
        `Signing event chain broken at sequence ${chainResult.brokenAtSequence}. ` +
        `An event may have been inserted, deleted, or modified.`,
      );
    }

    return {
      valid: certificateHashMatch && snapshotIntegrity && chainResult.valid,
      certificateId,
      certificateHashMatch,
      reconstructedHash,
      storedHash,
      snapshotIntegrity,
      eventChainValid: chainResult.valid,
      brokenAtSequence: chainResult.brokenAtSequence,
      anomaliesDetected: anomalies,
    };
  }

  // Returns the full certificate payload for the given certificate.
  // Used for JSON export / archiving / third-party independent verification.
  // Does NOT recompute the hash.
  async exportPayload(certificateId: string): Promise<{
    certificateId: string;
    certificateHash: string;
    issuedAt: string;
    payload: CertificatePayload;
    canonicalJson: string;
  }> {
    const cert = await this.db.acceptanceCertificate.findUnique({
      where: { id: certificateId },
    });

    if (!cert) throw new NotFoundException('Certificate not found');

    const built = await this.builder.build(
      cert.acceptanceRecordId,
      certificateId,
      cert.issuedAt,
    );

    return {
      certificateId,
      certificateHash: cert.certificateHash,
      issuedAt: cert.issuedAt.toISOString(),
      payload: built.payload,
      canonicalJson: built.canonicalJson,
    };
  }
}
