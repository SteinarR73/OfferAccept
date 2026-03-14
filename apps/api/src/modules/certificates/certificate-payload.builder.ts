import * as crypto from 'crypto';
import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// ─── CertificatePayloadBuilder ─────────────────────────────────────────────────
// Builds the canonical certificate payload from immutable evidence only.
// Matches the field specification in docs/certificate-spec.md exactly.
//
// Sources: AcceptanceRecord + OfferSnapshot + OfferSnapshotDocument[] + OfferRecipient
// Never reads: Offer, User, Organization (mutable entities)
//
// The certificateHash is computed by hashing all other fields in canonical form.
// This hash is stored in AcceptanceCertificate.certificateHash.

export interface CertificateDocument {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256Hash: string;
}

export interface CertificatePayload {
  certificateId: string;      // AcceptanceCertificate.id (assigned before hashing)
  issuedAt: string;           // ISO 8601
  issuer: 'OfferAccept';
  issuerVersion: '1.0';
  offer: {
    title: string;
    message: string | null;
    expiresAt: string | null; // ISO 8601
    sentAt: string;           // OfferSnapshot.frozenAt ISO 8601
    snapshotContentHash: string;
  };
  sender: {
    name: string;
    email: string;
  };
  recipient: {
    name: string;
    verifiedEmail: string;
  };
  documents: CertificateDocument[];
  acceptance: {
    statement: string;
    acceptedAt: string;         // ISO 8601
    verifiedEmail: string;
    emailVerifiedAt: string;    // ISO 8601
    ipAddress: string | null;
    userAgent: string | null;
    locale: string | null;
    timezone: string | null;
  };
}

export interface BuiltCertificate {
  payload: CertificatePayload;
  certificateHash: string;
  canonicalJson: string; // the exact string that was hashed — for audit
}

@Injectable()
export class CertificatePayloadBuilder {
  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  // Build the certificate payload for an AcceptanceRecord.
  // `certificateId` is the ID that will be assigned to the AcceptanceCertificate row.
  // It must be provided before hashing so it appears in the hash input.
  async build(acceptanceRecordId: string, certificateId: string, issuedAt: Date): Promise<BuiltCertificate> {
    // Load AcceptanceRecord with snapshot and session
    const record = await this.db.acceptanceRecord.findUniqueOrThrow({
      where: { id: acceptanceRecordId },
      include: {
        snapshot: {
          include: { documents: true },
        },
      },
    });

    // Load recipient for the name (name is not in AcceptanceRecord)
    const recipient = await this.db.offerRecipient.findUniqueOrThrow({
      where: { id: record.recipientId },
    });

    const { snapshot } = record;

    // Sort documents by storageKey (deterministic order, matches snapshot hash)
    const sortedDocs = [...snapshot.documents].sort((a, b) =>
      a.storageKey.localeCompare(b.storageKey),
    );

    const payload: CertificatePayload = {
      certificateId,
      issuedAt: issuedAt.toISOString(),
      issuer: 'OfferAccept',
      issuerVersion: '1.0',
      offer: {
        title: snapshot.title,
        message: snapshot.message,
        expiresAt: snapshot.expiresAt?.toISOString() ?? null,
        sentAt: snapshot.frozenAt.toISOString(),
        snapshotContentHash: snapshot.contentHash,
      },
      sender: {
        name: snapshot.senderName,
        email: snapshot.senderEmail,
      },
      recipient: {
        name: recipient.name,
        verifiedEmail: record.verifiedEmail,
      },
      documents: sortedDocs.map((d) => ({
        filename: d.filename,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        sha256Hash: d.sha256Hash,
        // storageKey is intentionally excluded per spec
      })),
      acceptance: {
        statement: record.acceptanceStatement,
        acceptedAt: record.acceptedAt.toISOString(),
        verifiedEmail: record.verifiedEmail,
        emailVerifiedAt: record.emailVerifiedAt.toISOString(),
        ipAddress: record.ipAddress,
        userAgent: record.userAgent,
        locale: record.locale,
        timezone: record.timezone,
      },
    };

    const { hash, canonical } = computeCertificateHash(payload);

    return {
      payload,
      certificateHash: hash,
      canonicalJson: canonical,
    };
  }
}

// ─── Certificate hash computation ─────────────────────────────────────────────
// Public so it can be used in tests and verification tools independently
// of the builder (which requires a DB connection).

export function computeCertificateHash(payload: CertificatePayload): {
  hash: string;
  canonical: string;
} {
  const canonical = JSON.stringify(deepSortKeys(payload));
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return { hash, canonical };
}

// Deep-sorts all object keys alphabetically for deterministic serialization.
// Arrays preserve element order.
function deepSortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepSortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, deepSortKeys(obj[k])]),
    );
  }
  return value;
}
