# OfferAccept Trust Overview

**Audience:** Enterprise buyers, legal reviewers, security teams, technical integrators  
**Version:** 1.0 — March 2026  

---

## What OfferAccept is (and is not)

OfferAccept is an **acceptance recording platform**, not an electronic signature platform.

It does not apply cryptographic signatures to documents. It does not attest to a signer's legal identity beyond control of an email inbox. What it does, verifiably and durably, is record that a specific person — identified by OTP-verified email address — reviewed a specific frozen offer at a specific point in time and actively chose to accept it.

The evidentiary record is tamper-evident: a SHA-256 hash of the full acceptance payload is stored at the moment of acceptance and can be independently reconstructed at any future time. Any alteration to any field in the record — however small — produces a different hash, making tampering detectable without trusting OfferAccept as an intermediary.

---

## The signing flow

Acceptance happens through a five-step protocol. Each step leaves an immutable audit record.

### Step 1 — Offer is frozen at send time

When a sender dispatches an offer, OfferAccept creates an `OfferSnapshot`: a complete, immutable copy of the offer title, message, sender identity, expiry time, and all attached documents (with SHA-256 hashes of each file's content). The snapshot is frozen at send time — subsequent edits to the offer do not affect it.

The snapshot itself is content-hashed: `OfferSnapshot.contentHash` is SHA-256 of the canonical snapshot JSON. Any document modification after send time is detectable because the snapshot SHA-256 hashes would not match the files at rest.

### Step 2 — Recipient opens the signing link

The recipient receives a time-limited, recipient-specific signing link. Opening the link fetches the frozen offer context and displays the acceptance statement. No OTP is sent at this stage.

> **Why not on link open?**  
> Email security scanners follow links to check for phishing. If opening the URL triggered an OTP delivery, the scanner would consume the OTP before the recipient saw it. OTP issuance is gated on explicit recipient action (a POST, not a GET).

### Step 3 — Recipient requests an OTP

The recipient clicks "Send verification code." This creates a `SigningSession` and issues a one-time passcode to the exact email address shown in the offer. The challenge is rate-limited: 3 issuances per recipient per hour, with a burst cap of 3 per 10 seconds on verification attempts.

### Step 4 — Recipient verifies the OTP

The recipient enters the code. If correct:
- `SigningSession.status` advances to `OTP_VERIFIED`
- `OtpChallenge.verifiedAt` is stamped
- A `SigningEvent` of type `OTP_VERIFIED` is appended to the immutable event chain

The challenge is bound to the session. A code from a different session cannot advance this one.

### Step 5 — Recipient accepts

The recipient clicks "I accept." The acceptance is submitted. OfferAccept atomically:

1. Creates an `AcceptanceRecord` (append-only — never updated, never deleted) capturing the exact acceptance statement text, verified email, IP address, user agent, locale, timezone, and timestamps
2. Advances the offer status to `ACCEPTED`
3. Appends a `SigningEvent` of type `ACCEPTED` to the event chain
4. Builds a `CertificatePayload` from the immutable evidence
5. Computes the `certificateHash` (see below)
6. Stores the `AcceptanceCertificate` with the hash
7. Enqueues a durable pg-boss job to send the acceptance notification email

Steps 1–7 execute in a single database transaction. The certificate either exists or it does not — there is no partial state.

---

## How the certificate hash is computed

The `certificateHash` is a SHA-256 digest of the certificate payload in canonical form. The canonical form is defined precisely so any third party can reproduce it independently:

1. **Assemble the payload** — all fields from `AcceptanceRecord`, `OfferSnapshot`, `OfferSnapshotDocument[]`, and `OfferRecipient`. The full field list is documented in [certificate-spec.md](certificate-spec.md).

2. **Sort all keys alphabetically** — at every level of nesting, recursively. Arrays keep their element order (documents are sorted by `storageKey` before building the payload, so the order is deterministic).

3. **Serialize without whitespace** — `JSON.stringify(deepSortKeys(payload))`.

4. **Hash in UTF-8** — `SHA-256(canonical, encoding='utf-8')`, returned as lowercase hex.

The exact implementation:

```typescript
function deepSortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepSortKeys);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj).sort().map((k) => [k, deepSortKeys(obj[k])])
    );
  }
  return value;
}

const canonical = JSON.stringify(deepSortKeys(payload));
const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
```

`null` values are included in the canonical form (never omitted). A certificate with `ipAddress: null` hashes differently from one with a populated IP — preventing hash collisions between otherwise identical records with different evidence.

The stored `certificateHash` is verified on every call to `GET /certificates/:id/verify`. The service re-queries the raw evidence tables, recomputes the canonical JSON from scratch, and compares the freshly computed hash against the stored one. A mismatch means someone modified the database records since the certificate was issued.

---

## The canonical acceptance hash

Alongside the full certificate hash, each certificate stores a `canonicalHash`: a lightweight five-field fingerprint of the acceptance act itself.

```
acceptedAt | dealId | ipAddress | recipientEmail | userAgent
```

These five fields are serialized in alphabetical key order (matching `deepSortKeys`), JSON-stringified, and SHA-256 hashed. A third party who holds only these five values can verify the acceptance without needing the full certificate payload or authenticated API access.

---

## Immutable evidence tables

The trust model depends on four tables that are **append-only by policy and by application code**. No application path issues `UPDATE` or `DELETE` against them:

| Table | What it records |
|---|---|
| `AcceptanceRecord` | The acceptance act: verified email, statement, timestamps, IP, UA |
| `OfferSnapshot` | The frozen offer content at send time |
| `OfferSnapshotDocument` | Per-document SHA-256 hash at send time |
| `SigningEvent` | Ordered event chain: LINK_OPENED, OTP_ISSUED, OTP_VERIFIED, ACCEPTED |

Because these rows are never modified, the hash computed at any future time against the live database should match the hash computed at acceptance time — unless the data was tampered with.

---

## The signing event chain

`SigningEvent` rows form an ordered chain. Each event records its type, the session it belongs to, and a timestamp. The `CertificateService.verify()` method validates the chain on every verification request, checking:

- LINK_OPENED appears before OTP_ISSUED
- OTP_ISSUED appears before OTP_VERIFIED
- OTP_VERIFIED appears before ACCEPTED
- No invalid state transitions exist in the chain

A manipulated event chain — one where acceptance appears without a preceding OTP verification — is flagged as an anomaly in the verification response.

---

## Public verification

The `GET /certificates/:id/verify` endpoint is public (no authentication required). It:

1. Re-queries the raw immutable evidence tables
2. Recomputes the canonical certificate payload from scratch
3. Recomputes the SHA-256 hash
4. Compares reconstructed hash to stored hash
5. Validates the signing event chain
6. Checks snapshot content hash against the stored offer snapshot

The response includes:

```json
{
  "valid": true,
  "certificateHashMatch": true,
  "reconstructedHash": "a3f2...",
  "storedHash": "a3f2...",
  "snapshotIntegrity": true,
  "eventChainIntegrity": true,
  "anomaliesDetected": []
}
```

The endpoint exposes hashes and booleans only — no acceptance statement text, no email addresses, no IP addresses, no offer content. Sensitive data is available only to authenticated members of the issuing organization.

For fully independent verification (without trusting OfferAccept's computation):
1. Call `GET /certificates/:id/export` (authenticated) to retrieve the full payload and `canonicalJson`
2. Compute `SHA-256(canonicalJson)` locally
3. Compare your computed hash against `certificateHash`

The hash specification at [/docs/certificate-hash-spec](/docs/certificate-hash-spec) provides reference implementations in JavaScript and Python.

---

## Certificate durability

An acceptance certificate remains verifiable as long as the database rows exist. The durability model:

- **Hash-only verification** — any party can verify `SHA-256(reconstructed canonical) == storedHash` without OfferAccept infrastructure, as long as they can read the raw evidence rows
- **PDF record** — `GET /certificates/:id/pdf` streams a PDF rendering of the certificate, suitable for email archives and document management systems
- **Verify URL** — the certificate page at `https://offeraccept.com/verify/:id` displays the verification result to any visitor
- **Data retention** — acceptance certificates and associated evidence are retained for the lifetime of the account and a minimum of 7 years after acceptance (see the [DPA](/legal/dpa))

---

## What the certificate proves and does not prove

### Proves

- An email address that received the signing link also received and entered a valid OTP
- The email was OTP-verified before the acceptance event was recorded
- The acceptance occurred against a specific frozen offer snapshot (by content hash)
- The acceptance statement seen by the recipient is exactly the text in the certificate
- No modification to any evidence field has occurred since issuance (assuming hash match)

### Does not prove

- That the named person physically controlled the device — only that someone with access to the email inbox entered a valid OTP
- That the recipient read or understood the offer content
- That the acceptance meets the legal standard of a binding contract in any jurisdiction (jurisdiction-dependent)
- Identity beyond "control of the email inbox at the time of OTP verification"

These limitations are intentional for v1. Future extensions — RFC 3161 timestamps, qualified e-signatures, witness emails — are documented in [certificate-spec.md](certificate-spec.md).

---

## Security controls

| Control | Detail |
|---|---|
| OTP rate limiting | 3 issuances per recipient per hour; 3 per 10 s burst cap; fails closed when Redis is unavailable |
| Login rate limiting | 10 per IP per 15 min; 3 per 10 s burst cap; fails closed |
| Sliding-window limiter | Lua script atomic check-and-increment in Redis sorted set; no TOCTOU race |
| Transport security | TLS 1.2+ in transit; encryption at rest |
| Cookie security | HttpOnly, Secure, SameSite=Strict |
| CSRF protection | Origin-header middleware on all state-mutating routes |
| Content Security Policy | Restrictive CSP headers on all Next.js responses |
| Certificate sealing | SHA-256 hash stored at issuance; recomputed on every verify call |
| Sentry error monitoring | PII scrubbing; OTP values filtered in `beforeSend`; alerts on anomaly spikes |

---

## Data processing

OfferAccept processes personal data as a data processor on behalf of the sender organization (the controller). The full terms are in the [Data Processing Agreement](/legal/dpa), including:

- Categories of data processed
- Sub-processor list (cloud infrastructure, email delivery, payment processing)
- 72-hour breach notification commitment
- Standard Contractual Clauses for EEA → US transfers
- GDPR Art. 20 data export: `GET /api/v1/account/export`
- GDPR Art. 17 erasure request: `POST /api/v1/account/erasure-request`

Note: acceptance records and certificates cannot be deleted. Deletion would invalidate the certificate hash and destroy the evidentiary record. This is documented in the DPA and explained to data subjects requesting erasure.

---

*Questions about this document or the trust model: [privacy@offeraccept.com](mailto:privacy@offeraccept.com)*
