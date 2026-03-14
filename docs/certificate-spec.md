# OfferAccept v1 — Acceptance Certificate Content Specification

## Purpose

This document defines the exact fields included in a v1 acceptance certificate and the
canonical form used for integrity hashing. It is intentionally separate from any PDF
presentation layer — the canonical content is what matters for verification; the PDF is
a human-readable rendering of it.

Any future implementation of certificate generation must conform to this specification.
Any change to this spec constitutes a breaking change to existing certificates.

---

## Certificate Sections

### 1. Certificate Identity

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `certificateId` | string | `AcceptanceCertificate.id` | Unique ID for this certificate |
| `issuedAt` | ISO 8601 string | `AcceptanceCertificate.issuedAt` | When the certificate was generated |
| `issuer` | string | constant `"OfferAccept"` | |
| `issuerVersion` | string | constant `"1.0"` | Schema version, not app version |

### 2. Offer Details

Sourced exclusively from `OfferSnapshot`. Never from mutable `Offer` fields.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `offer.title` | string | `OfferSnapshot.title` | Frozen at send time |
| `offer.message` | string \| null | `OfferSnapshot.message` | Frozen at send time |
| `offer.expiresAt` | ISO 8601 \| null | `OfferSnapshot.expiresAt` | Offer expiry as set at send time |
| `offer.sentAt` | ISO 8601 | `OfferSnapshot.frozenAt` | When the offer was frozen/sent |
| `offer.snapshotContentHash` | hex string | `OfferSnapshot.contentHash` | SHA-256 of canonical snapshot JSON |

### 3. Sender Identity

Sourced from `OfferSnapshot` (frozen at send time — sender may later change their name/email).

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `sender.name` | string | `OfferSnapshot.senderName` | |
| `sender.email` | string | `OfferSnapshot.senderEmail` | |

### 4. Recipient Identity

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `recipient.name` | string | `OfferRecipient.name` | As entered by the sender |
| `recipient.verifiedEmail` | string | `AcceptanceRecord.verifiedEmail` | OTP-verified email address |

### 5. Documents

One entry per `OfferSnapshotDocument`. Sourced from the snapshot, not from current `OfferDocument` state.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `documents[].filename` | string | `OfferSnapshotDocument.filename` | |
| `documents[].mimeType` | string | `OfferSnapshotDocument.mimeType` | |
| `documents[].sizeBytes` | number | `OfferSnapshotDocument.sizeBytes` | |
| `documents[].sha256Hash` | hex string | `OfferSnapshotDocument.sha256Hash` | SHA-256 of file content at send time |

`storageKey` is NOT included in the certificate — it is an internal routing detail.

### 6. Acceptance Evidence

Sourced exclusively from `AcceptanceRecord`. All fields are immutable after creation.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `acceptance.statement` | string | `AcceptanceRecord.acceptanceStatement` | Exact text displayed to recipient |
| `acceptance.acceptedAt` | ISO 8601 | `AcceptanceRecord.acceptedAt` | Timestamp of acceptance submission |
| `acceptance.verifiedEmail` | string | `AcceptanceRecord.verifiedEmail` | OTP-verified inbox |
| `acceptance.emailVerifiedAt` | ISO 8601 | `AcceptanceRecord.emailVerifiedAt` | When OTP was verified |
| `acceptance.ipAddress` | string \| null | `AcceptanceRecord.ipAddress` | Network context at acceptance |
| `acceptance.userAgent` | string \| null | `AcceptanceRecord.userAgent` | Browser UA at acceptance |
| `acceptance.locale` | string \| null | `AcceptanceRecord.locale` | Browser locale (e.g. "en-GB") |
| `acceptance.timezone` | string \| null | `AcceptanceRecord.timezone` | IANA timezone (e.g. "Europe/London") |

### 7. Integrity

| Field | Type | Notes |
|-------|------|-------|
| `certificateHash` | hex string | SHA-256 of the canonical certificate content (see below). Stored in `AcceptanceCertificate.certificateHash`. |

---

## Canonical Certificate Content

The `certificateHash` is the SHA-256 of the canonical JSON serialization of the certificate,
**excluding the `certificateHash` field itself**.

### Canonical form rules

1. All fields included according to the sections above
2. All keys sorted alphabetically at every level of nesting
3. No whitespace (compact serialization)
4. UTF-8 encoding
5. `null` values are included (not omitted)
6. Arrays maintain their element order (document order is determined by `storageKey` sort)
7. Dates are ISO 8601 strings in UTC (`.toISOString()`)

### Canonical structure (key order after sort)

```json
{
  "acceptance": {
    "acceptedAt": "...",
    "emailVerifiedAt": "...",
    "ipAddress": "..." | null,
    "locale": "..." | null,
    "statement": "...",
    "timezone": "..." | null,
    "userAgent": "..." | null,
    "verifiedEmail": "..."
  },
  "certificateId": "...",
  "documents": [
    {
      "filename": "...",
      "mimeType": "...",
      "sha256Hash": "...",
      "sizeBytes": 12345
    }
  ],
  "issuedAt": "...",
  "issuer": "OfferAccept",
  "issuerVersion": "1.0",
  "offer": {
    "expiresAt": "..." | null,
    "message": "..." | null,
    "sentAt": "...",
    "snapshotContentHash": "...",
    "title": "..."
  },
  "recipient": {
    "name": "...",
    "verifiedEmail": "..."
  },
  "sender": {
    "email": "...",
    "name": "..."
  }
}
```

Hash computation (pseudocode):
```
content = build canonical object (excluding certificateHash)
canonical = JSON.stringify(deepSortKeys(content))  // no whitespace
certificateHash = SHA256(canonical).hexdigest()
```

---

## Verification Protocol

To independently verify a certificate:

1. Obtain the canonical inputs:
   - `AcceptanceCertificate` record (for `certificateId`, `issuedAt`, `acceptanceRecordId`)
   - `AcceptanceRecord` (for all acceptance evidence fields)
   - `OfferSnapshot` + `OfferSnapshotDocument[]` (for offer and document fields)
   - `OfferRecipient` (for `recipient.name`)

2. Reconstruct the canonical JSON using the specification above

3. Compute `SHA256(canonical)`

4. Compare against `AcceptanceCertificate.certificateHash`

5. Optionally: verify the signing event chain via `SigningEventService.verifyChain(sessionId)`

6. Optionally: verify `AcceptanceRecord.snapshotContentHash` matches `OfferSnapshot.contentHash`

---

## What the Certificate Does NOT Prove

- That the person named in the offer is the same person who controls the email inbox
- That the recipient read or understood the offer content
- That the acceptance meets any specific legal standard (jurisdiction-dependent)
- That documents were not modified after the snapshot was created (sha256Hash provides
  file integrity, not legal authenticity of the document content itself)
- Identity beyond "control of the email inbox at the time of OTP verification"

These limitations are intentional for v1 and are documented in [architecture.md](architecture.md).

---

## Future Extensions (not in v1)

| Extension | What it adds |
|-----------|-------------|
| Timestamp authority (RFC 3161) | Third-party timestamp on the certificate hash — non-repudiation of the *time* of signing |
| Qualified e-signature | Government-ID-verified identity; eIDAS compliance |
| Witness emails | CC additional parties at send time |
| Org-branded acceptance statement | Customizable per-org statement text |
| SMS OTP | Additional channel for OTP delivery |
