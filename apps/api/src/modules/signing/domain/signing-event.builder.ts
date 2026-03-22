import * as crypto from 'crypto';
import { SigningEventType } from '@offeraccept/database';

// ─── Signing Event Hash Chain Builder ─────────────────────────────────────────
//
// Computes the eventHash that makes signing events form a verifiable chain.
//
// Hash input (pipe-delimited, UTF-8 encoded):
//   sessionId | sequenceNumber | eventType | canonicalPayload | timestamp | prevHash
//
// where:
//   canonicalPayload = JSON.stringify(payload) with keys sorted, or "" if null
//   prevHash = previousEventHash of prior event, or the sentinel "GENESIS" for event #1
//
// The "|" delimiter is safe because none of the fields naturally contain "|".
// sessionId and eventHash are cuid/hex strings. eventType is an enum value.
// payload is serialized with sorted keys to ensure determinism.
//
// Verification (same algorithm, independent implementation):
//   1. Load all events for a session ordered by sequenceNumber ASC
//   2. For each event, recompute eventHash from its stored fields
//   3. Assert computed == stored eventHash
//   4. Assert stored previousEventHash == prior event's eventHash (null for first)
//   5. If any assertion fails, the chain has been broken

export interface EventHashInput {
  sessionId: string;
  sequenceNumber: number;
  eventType: SigningEventType;
  payload: Record<string, unknown> | null;
  timestamp: Date;
  previousEventHash: string | null;
}

const GENESIS_SENTINEL = 'GENESIS';

export function computeEventHash(input: EventHashInput): string {
  const canonicalPayload = input.payload
    ? JSON.stringify(sortObjectKeys(input.payload))
    : '';

  const hashInput = [
    input.sessionId,
    String(input.sequenceNumber),
    input.eventType,
    canonicalPayload,
    input.timestamp.toISOString(),
    input.previousEventHash ?? GENESIS_SENTINEL,
  ].join('|');

  return crypto.createHash('sha256').update(hashInput, 'utf8').digest('hex');
}

// Deep-sorts all keys in an object for deterministic JSON serialization.
// Arrays preserve order (element position is semantic).
function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.keys(obj as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortObjectKeys((obj as Record<string, unknown>)[k])]),
    );
  }
  return obj;
}

// ─── Canonical snapshot hash ───────────────────────────────────────────────────
// Used when creating OfferSnapshot.contentHash.
// Must be reproduced exactly when verifying a certificate.
//
// Input shape:
//   {
//     title, message, senderName, senderEmail, expiresAt,
//     documents: [{ filename, sha256Hash, storageKey }]   ← sorted by storageKey
//   }
// All strings. expiresAt is ISO 8601 or null. message is null if absent.

export interface SnapshotHashInput {
  title: string;
  message: string | null;
  senderName: string;
  senderEmail: string;
  expiresAt: string | null; // ISO 8601
  documents: Array<{
    filename: string;
    sha256Hash: string;
    storageKey: string;
  }>;
}

export function computeSnapshotHash(input: SnapshotHashInput): string {
  // Sort documents by storageKey for determinism
  const sorted: SnapshotHashInput = {
    ...input,
    documents: [...input.documents].sort((a, b) =>
      a.storageKey.localeCompare(b.storageKey),
    ),
  };

  // sortObjectKeys ensures top-level key order is alphabetical too
  const canonical = JSON.stringify(sortObjectKeys(sorted));
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}
