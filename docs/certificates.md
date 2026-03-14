# OfferAccept v1 — Certificate Verification

This document describes the acceptance certificate model, what the certificate proves,
what verification checks are performed, and how third parties can independently verify
a certificate.

---

## 1. What Is an Acceptance Certificate?

An acceptance certificate is a tamper-evident record that a specific recipient, who
demonstrated control of a specific email address, accepted a specific frozen offer.

A certificate is issued automatically when an offer is accepted. It is derived entirely
from immutable evidence already present in the database — no new facts are introduced
at issuance time.

Each certificate has a globally unique `certificateId` (UUID) and a `certificateHash`
(SHA-256) that binds together:

- The frozen offer content (title, sender identity, documents)
- The recipient's verified email address
- The acceptance statement shown to the recipient
- The exact timestamp at which the certificate was issued

---

## 2. The Three-Check Verification Model

Running `GET /certificates/:id/verify` (or `GET /support/offers/:id/case`) runs three
independent integrity checks. All three run regardless of whether an earlier check fails,
so `anomaliesDetected` always contains the complete list of problems.

### Check 1 — Certificate hash

The certificate payload is rebuilt from the same immutable evidence stored in the
database, using the `issuedAt` timestamp recorded at issuance time. The resulting
SHA-256 hash is compared to the `certificateHash` stored in `AcceptanceCertificate`.

**Detects:** Any modification to the certificate row itself, the acceptance record, the
signing session, or the offer snapshot content that feeds into the payload.

### Check 2 — Offer snapshot integrity

The `OfferSnapshot.contentHash` is recomputed from the raw `OfferSnapshotDocument` rows
(filename, SHA-256 hash, storage key) currently in the database. The result is compared
to the `contentHash` stored on the `OfferSnapshot` row at send time.

**Detects:** Post-send mutations to the frozen offer content — for example, a document
file hash being changed without re-issuing the snapshot — that would not be caught by
the certificate hash alone if `snapshot.contentHash` was not also mutated.

### Check 3 — Signing event chain integrity

Each `SigningEvent` in the acceptance session is hashed over its own content and the
hash of the previous event. The chain is re-verified link by link from the first event
to the last.

**Detects:** Insertion, deletion, or modification of any event in the signing session
history. A broken chain is reported with `brokenAtSequence`, the sequence number of
the first inconsistent link.

### Verification result shape

```json
{
  "certificateId": "550e8400-...",
  "valid": true,
  "certificateHashMatch": true,
  "reconstructedHash": "a3f1...",
  "storedHash": "a3f1...",
  "snapshotIntegrity": true,
  "eventChainIntegrity": true,
  "anomaliesDetected": []
}
```

`valid` is `true` only when all three checks pass. When any check fails, `valid` is
`false` and `anomaliesDetected` contains a human-readable description of each failure.

---

## 3. Hash Determinism

The certificate hash is reproducible given the same inputs.

The `issuedAt` timestamp is:

1. Generated once, at issuance time.
2. Stored in the `AcceptanceCertificate` row.
3. Passed into the payload builder on every subsequent rebuild.

The builder never generates a new timestamp internally. Re-running the builder with the
stored `issuedAt` and the same immutable evidence always produces the same hash.

This means third parties can independently recompute the hash given only:

- The exported payload (from `GET /certificates/:id/export`)
- The `issuedAt` timestamp
- The canonical JSON serialization described below

---

## 4. Canonical JSON Serialization

The hash input is produced by:

1. Taking the full `CertificatePayload` object
2. Deep-sorting all object keys alphabetically (recursively)
3. Calling `JSON.stringify()` on the sorted object
4. Computing `SHA-256` of the resulting UTF-8 string

This ensures the hash is independent of key insertion order, which may vary across
database drivers, ORM versions, or serialization libraries.

The `canonicalJson` field in `GET /certificates/:id/export` is the exact string that
was hashed. A third party can hash that string directly to verify it matches
`certificateHash`.

---

## 5. What the Certificate Proves

| Claim | How it is evidenced |
|-------|---------------------|
| A recipient with control of `recipientEmail` accepted the offer | OTP verified by signing event chain; OTP sent to recipient's email |
| The recipient accepted the specific content frozen at send time | Offer snapshot binds document hashes; snapshot content hash is independent of certificate |
| The acceptance text shown to the recipient is known | `acceptanceStatement` field in the certificate payload |
| The acceptance occurred at a specific time | `issuedAt` timestamp and `OFFER_ACCEPTED` signing event timestamp |
| The evidence trail has not been altered since acceptance | Certificate hash + snapshot integrity + event chain re-verification |

---

## 6. What the Certificate Does Not Prove

| Limitation | Explanation |
|------------|-------------|
| Legal identity of the recipient | OTP verifies email control only — not that the email owner is who they claim to be |
| That the recipient read or understood the documents | Viewing events are recorded but are not legally equivalent to informed consent |
| Qualified electronic signature (QES) | This is an evidenced-acceptance system, not a regulated eIDAS/ESIGN signing service |
| Non-repudiation in all legal jurisdictions | Admissibility varies by jurisdiction and is outside the scope of this system |
| Immutability of documents on disk | Document hashes in the snapshot match what was sent; physical storage integrity is outside this system |

---

## 7. Third-Party Independent Verification

To fully verify a certificate without trusting OfferAccept's verification endpoint:

### Step 1 — Retrieve the verification summary (public)

```
GET /certificates/:id/verify
```

No authentication required. Returns `reconstructedHash`, `storedHash`, and all check
results. This is the quick path for confirming the certificate is intact.

### Step 2 — Retrieve the full payload (authenticated)

```
GET /certificates/:id/export
Authorization: Bearer <jwt>
```

Returns:

```json
{
  "certificateId": "550e8400-...",
  "certificateHash": "a3f1...",
  "issuedAt": "2024-01-02T10:05:00.000Z",
  "payload": { ... },
  "canonicalJson": "{\"acceptanceStatement\":\"I accept...\", ...}"
}
```

### Step 3 — Recompute the hash yourself

```typescript
import { createHash } from 'crypto';

const hash = createHash('sha256')
  .update(canonicalJson, 'utf8')
  .digest('hex');

console.log(hash === certificateHash); // true if intact
```

The `canonicalJson` field is the exact string that was hashed at issuance. You do not
need to implement deep-key-sorting yourself — the export provides the pre-serialized
string.

### Step 4 — Verify document integrity (optional)

Each document listed in `payload.offer.documents` includes a `sha256Hash`. If you have
access to the original document files, you can recompute the SHA-256 hash of each file
and compare it to the value in the payload.

---

## 8. Endpoints Reference

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /certificates/:id/verify` | None | Verification summary (no sensitive data) |
| `GET /certificates/:id` | JWT | Metadata + stored hash |
| `GET /certificates/:id/export` | JWT | Full payload + canonicalJson for archiving |

The public verify endpoint deliberately excludes:

- Acceptance statement text (verbatim legal text — use `/export`)
- IP addresses and user agent strings
- Raw email addresses
- Full payload content

It returns only hashes, booleans, and anomaly descriptions — sufficient to confirm
integrity without exposing any party's personal data.
