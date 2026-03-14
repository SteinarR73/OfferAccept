# OfferAccept v2 — Architecture

## Overview

OfferAccept is a commercial offer acceptance platform for SMBs. Its job is to make it easy
for a sender to present a commercial offer and for a recipient to accept it, and to produce
a verifiable, tamper-evident record that the acceptance happened — one that can later prove
what was accepted, who accepted it, and when.

This document covers the bounded contexts, request flows, signing trust model, event chain
design, and rationale for key architectural decisions.

---

## What OfferAccept v1 Is — and Explicitly Is Not

**It is:** a lightweight, auditable offer acceptance tool for SMBs who need something more
defensible than "they replied yes to an email" and simpler than a full e-sign platform.

**It is not:**
- A qualified electronic signature (QES) platform under eIDAS or equivalent regulation
- A substitute for legal review of offer content
- A biometric or government-ID identity verification service
- A replacement for a lawyer or a contract management system
- A general document signing tool (DocuSign/HelloSign competitor in scope)

The trust assertion is: *the person who controls the recipient's email inbox agreed to the
offer as presented.* This is the same level of assurance as a click-to-accept agreement or
an email reply confirmation — with significantly stronger auditability.

---

## Repository Structure

```
offeracept/
├── apps/
│   ├── web/          Next.js 15 — authenticated dashboard + public signing flow
│   └── api/          NestJS 10 — REST API, business logic
├── packages/
│   ├── database/     Prisma schema, migrations, PrismaClient singleton
│   └── types/        Shared TypeScript API contracts
└── docs/
    └── architecture.md
```

Managed as an npm workspace monorepo with Turborepo for task orchestration.

---

## Bounded Contexts

### 1. Identity (`organizations`, `users`)

Owns: organization creation, user accounts, authentication, role management.

- `Organization` is the top-level tenant. All offer data is org-scoped.
- `User` belongs to an org, has a `UserRole` (OWNER / ADMIN / MEMBER).
- Authentication uses JWTs. Refresh strategy TBD.
- Soft-deletes on both entities.

### 2. Offers (`offers`, `offer_documents`, `offer_snapshots`, `offer_snapshot_documents`)

Owns: offer lifecycle and content freezing.

- `Offer` is a mutable operational record (DRAFT to SENT to terminal).
- `OfferDocument` holds file metadata; the file lives in object storage.
- When an offer is sent, the Offers context creates an `OfferSnapshot` atomically.
  After that point, the snapshot owns the authoritative content — the `Offer` fields
  are not used for anything that needs to be proven later.
- v1: one recipient per offer, enforced by `OfferRecipient.offerId @unique`.

### 3. Signing (public-facing)

Owns: the recipient's entire journey — token validation, OTP, acceptance, decline.

- All endpoints are unauthenticated. The signed URL token is the credential.
- Signing sessions are bound to a specific `OfferSnapshot` at creation.
- Every meaningful action writes an immutable, chained `SigningEvent`.
- OTP verification is required before final acceptance can be submitted.
- Acceptance evidence is captured in an immutable `AcceptanceRecord`.

### 4. Certificates

Owns: generating and storing `AcceptanceCertificate` from `AcceptanceRecord`.

- Certificate content is derived from `AcceptanceRecord` and `OfferSnapshot` only.
- Mutable entities (`Offer`, `User`, `Organization`) are never read at certificate time.
- A `certificateHash` (SHA-256) allows third-party integrity verification.

### 5. Billing

Owns: Stripe webhook ingestion, subscription state, plan enforcement.

- `Subscription` is 1:1 with `Organization`. Stripe is authoritative.
- Other modules call `SubscriptionService.getPlan(orgId)` — no direct billing coupling.

---

## Signing Trust Model

### Why email link + OTP, not just email link

The email link alone proves that *someone* with access to the email inbox opened the link.
It does not prove that the person who opened the link is the intended recipient at the time
of acceptance — links can be forwarded, shared, or pre-loaded by email security scanners.

The OTP step adds a second factor: a time-limited code sent to the same inbox *at the moment
of acceptance*. This proves that at acceptance time, the recipient had live, active control
of the inbox. It also creates an independently timestamped audit event (the OTP delivery)
that is separate from the link click.

Together: **email link = identifies the session; OTP = verifies inbox control at acceptance time.**

### Token design

**Format:** `oa_<base64url(32 random bytes)>` — 256 bits of entropy.

**Storage:** only `SHA-256(rawToken)` is stored in `OfferRecipient.tokenHash`. The raw
token is generated once, embedded in the email link, and never persisted. If the database
is compromised, the attacker cannot reconstruct valid signing URLs.

**Lookup:** `WHERE tokenHash = SHA256(incoming) AND tokenExpiresAt > NOW() AND tokenInvalidatedAt IS NULL`

**Re-use:** a token is not invalidated on first use. The link can be re-opened (e.g., on a
second device), creating a new `SigningSession`. Only one session can reach `ACCEPTED` per
offer — enforced at the application layer.

**Invalidation:** `tokenInvalidatedAt` is set on offer revocation or explicit cancellation.

### OTP design

**Code:** 6-digit numeric, generated with `crypto.randomInt(100000, 999999)`.

**Storage:** only `SHA-256(code)` stored in `SigningOtpChallenge.codeHash`. The raw code
is sent by email and never stored anywhere in the system.

**TTL:** 10 minutes by default (`expiresAt`).

**Rate limiting:** `attemptCount` is incremented on each wrong guess. After `maxAttempts`
(default 5), the challenge is locked and an `OTP_MAX_ATTEMPTS` event is written. A new
OTP must be requested to continue.

**Re-issue:** a new OTP sets `invalidatedAt` on all prior challenges for the session.
Only one active challenge exists per session at any time.

**Channel extensibility:** `OtpChannel` enum is `EMAIL` in v1. Adding `SMS` later requires
adding the enum value and a delivery adapter — no schema migration needed beyond the enum.

---

## Frozen Offer Snapshot

When an offer transitions from `DRAFT` to `SENT`, the Offers service creates an
`OfferSnapshot` in the same database transaction. After this point:

- The snapshot is immutable — no `updatedAt` field exists on it.
- `Offer.title`, `Offer.message`, etc. may be edited by the sender cosmetically, but have
  no effect on the signing flow or the resulting certificate.
- The signing session is bound to `snapshotId`, not `offerId`.
- `AcceptanceRecord.snapshotContentHash` copies `OfferSnapshot.contentHash` at creation,
  making the acceptance record self-contained for certificate generation.

**contentHash** = SHA-256 of this canonical JSON:
```json
{
  "documents": [
    { "filename": "...", "sha256Hash": "...", "storageKey": "..." }
  ],
  "expiresAt": "...",
  "message": "...",
  "senderEmail": "...",
  "senderName": "...",
  "title": "..."
}
```
Keys sorted alphabetically, no whitespace, UTF-8. Documents ordered by `storageKey`.

`OfferSnapshotDocument.sha256Hash` is copied from `OfferDocument.sha256Hash`, computed at
upload time. This chains: snapshot hash -> document metadata -> file bytes.

---

## Signing Event Hash Chain

Every action in the signing flow writes a `SigningEvent`. Events are:

1. **Immutable** — no `updatedAt`, never updated or deleted
2. **Sequenced** — `sequenceNumber` is monotonically increasing per session, starting at 1
3. **Chained** — each event commits to the previous via a hash

**Hash construction:**

```
eventHash = SHA-256(
  sessionId + "|" + sequenceNumber + "|" + eventType + "|"
  + canonicalPayload + "|" + timestamp.toISOString() + "|"
  + (previousEventHash ?? "GENESIS")
)
```

Where `canonicalPayload = JSON.stringify(payload, sortedKeys)` or `""` if null.

- First event: `previousEventHash = null`; sentinel `"GENESIS"` is used in the hash input.
- Subsequent events: `previousEventHash = eventHash` of the prior event.

`@@unique([sessionId, sequenceNumber])` prevents duplicate sequence numbers at the DB
level, which would allow forking the chain.

**Verification algorithm:**
```
for each event ordered by sequenceNumber:
  expected = SHA256(fields + (previousEventHash ?? "GENESIS"))
  assert event.eventHash == expected
  assert event.previousEventHash == prior.eventHash  (null for first event)
```

**Limitations:** The chain detects tampering at rest (row mutation) and detects deleted or
missing events (broken sequence). It does not prevent a compromised application from
appending fraudulent events — that requires an external timestamping service or HSM, both
out of scope for v1.

---

## Certificate Derivation Model

```
AcceptanceRecord  (immutable, created atomically with OFFER_ACCEPTED event)
  ├── acceptanceStatement   exact text shown at acceptance UI (server-generated)
  ├── verifiedEmail         OTP-verified inbox address
  ├── emailVerifiedAt       timestamp of OTP verification
  ├── acceptedAt            timestamp of acceptance submission
  ├── ipAddress, userAgent  network context
  ├── locale, timezone      browser context
  └── snapshotContentHash   copied from OfferSnapshot.contentHash

OfferSnapshot  (immutable)
  ├── title, message, senderName, senderEmail, expiresAt
  ├── contentHash
  └── OfferSnapshotDocuments: filename, storageKey, sha256Hash per file

         ↓  certificate generator reads only these two entities

AcceptanceCertificate
  ├── certificateHash  SHA-256 of canonical certificate content
  └── pdfStorageKey    PDF in object storage (null until generated)
```

The certificate generator never reads `Offer`, `User`, or `Organization`. If any of those
are soft-deleted after acceptance, the certificate remains fully derivable and verifiable.

Independent verification: obtain the canonical inputs, recompute SHA-256, compare against
the stored `certificateHash`.

---

## Request Flows

### Creating and Sending an Offer

```
Sender (authenticated)
  │
  ├─ POST /api/v1/offers                 Create Offer (DRAFT)
  ├─ POST /api/v1/offers/:id/documents   Upload → compute sha256Hash → store metadata
  └─ POST /api/v1/offers/:id/send
         │
         ├─ Validate: DRAFT, has recipient, no existing snapshot
         ├─ Create OfferSnapshot + OfferSnapshotDocuments  [atomic]
         ├─ Generate token:
         │    rawToken = "oa_" + base64url(randomBytes(32))
         │    store tokenHash = SHA256(rawToken), tokenExpiresAt
         ├─ Set Offer.status = SENT
         └─ Enqueue email with rawToken  (rawToken is never written to DB)
```

### Signing Flow (Recipient)

```
Recipient opens: https://app.offeracept.com/sign/{rawToken}

1. VALIDATE TOKEN
   tokenHash = SHA256(rawToken)
   Lookup OfferRecipient WHERE tokenHash=? AND tokenExpiresAt > NOW()
                              AND tokenInvalidatedAt IS NULL
   Create SigningSession { snapshotId, status=AWAITING_OTP, expiresAt=now+4h }
   Write SigningEvent #1: SESSION_STARTED

2. ISSUE OTP
   POST /signing/:token/otp/request
   code = crypto.randomInt(100000, 999999)
   Store SigningOtpChallenge { codeHash=SHA256(code), expiresAt=now+10m }
   Invalidate prior challenges for this session
   Send code to recipient.email
   Write SigningEvent #N: OTP_ISSUED { challengeId, deliveryAddress }

3. VERIFY OTP
   POST /signing/:token/otp/verify { challengeId, code }
   Verify SHA256(code) == challenge.codeHash
   Check: expiresAt > NOW(), invalidatedAt IS NULL, attemptCount < maxAttempts
   On wrong code: increment attemptCount, write OTP_ATTEMPT_FAILED
   On lockout:    write OTP_MAX_ATTEMPTS, set challenge.invalidatedAt
   On success:    set challenge.verifiedAt, session.otpVerifiedAt
                  session.status = OTP_VERIFIED
                  Write SigningEvent #N: OTP_VERIFIED

4. VIEW DOCUMENTS (optional; each access is audited)
   GET /signing/:token/documents/:documentId
   Write SigningEvent #N: DOCUMENT_VIEWED { documentId, filename }

5. ACCEPT
   POST /signing/:token/accept { challengeId, locale, timezone }
   Require: session.status == OTP_VERIFIED
   Require: challenge.verifiedAt != null AND challenge matches session
   Require: session.expiresAt > NOW() AND snapshot.expiresAt > NOW() (if set)
   [Single transaction]:
     Create AcceptanceRecord { acceptanceStatement (server-generated),
       verifiedEmail, emailVerifiedAt, acceptedAt, ipAddress, userAgent,
       locale, timezone, snapshotContentHash }
     session.status = ACCEPTED, completedAt = NOW()
     recipient.status = ACCEPTED, respondedAt = NOW()
     offer.status = ACCEPTED
     Write SigningEvent #N: OFFER_ACCEPTED  [final event in chain]
   Enqueue: certificate generation job, confirmation emails
```

---

## State Machine Definitions

### Offer

```
DRAFT ──────────────────────────────► SENT
                                        │
                    ┌───────────────────┼──────────────┬────────────┐
                    ▼                   ▼              ▼            ▼
                ACCEPTED            DECLINED        EXPIRED      REVOKED
              [terminal]           [terminal]      [terminal]  [terminal]
```

### OfferRecipient

```
PENDING ──► VIEWED ──► OTP_VERIFIED ──► ACCEPTED [terminal]
    │           │             │
    │           └──► DECLINED [terminal]
    │           └──► EXPIRED  [terminal]
    └──────────────► EXPIRED  [terminal]
                              └──► DECLINED [terminal]
                              └──► EXPIRED  [terminal]
```

### SigningSession

```
AWAITING_OTP ──► OTP_VERIFIED ──► ACCEPTED  [terminal]
     │                │          ► DECLINED  [terminal]
     │                └─────────► EXPIRED   [terminal]
     │                └─────────► ABANDONED [terminal]
     └──────────────────────────► EXPIRED   [terminal]
     └──────────────────────────► ABANDONED [terminal]
```

### SigningOtpChallenge

```
PENDING ──► VERIFIED    [terminal]
        ──► EXPIRED     [terminal]
        ──► LOCKED      [terminal]
        ──► INVALIDATED [terminal]
```

### Terminal states

| Entity | Terminal states |
|--------|----------------|
| Offer | ACCEPTED, DECLINED, EXPIRED, REVOKED |
| OfferRecipient | ACCEPTED, DECLINED, EXPIRED |
| SigningSession | ACCEPTED, DECLINED, EXPIRED, ABANDONED |
| SigningOtpChallenge | VERIFIED, EXPIRED, LOCKED, INVALIDATED |

**Rule:** once an entity is in a terminal state, no further transitions are possible.
The `StateMachine.assertTransition()` method throws `TerminalStateError` if called on a
terminal state. All service methods check this before any DB write.

### Events emitted per transition

| Transition | SigningEvent |
|------------|-------------|
| Session created (AWAITING_OTP) | `SESSION_STARTED` |
| OTP issued | `OTP_ISSUED` |
| Wrong OTP code | `OTP_ATTEMPT_FAILED` |
| OTP locked | `OTP_MAX_ATTEMPTS` |
| OTP verified → session OTP_VERIFIED | `OTP_VERIFIED` |
| Document accessed | `DOCUMENT_VIEWED` |
| Session/recipient/offer → ACCEPTED | `OFFER_ACCEPTED` |
| Session/recipient/offer → DECLINED | `OFFER_DECLINED` |
| Session → EXPIRED | `SESSION_EXPIRED` |
| Session → ABANDONED | `SESSION_ABANDONED` |

---

## Abuse Protection Design (v1)

### Rate limiting

Implemented as in-process sliding window counters (`RateLimitService`).
For multi-process deployments, replace the in-memory store with Redis.

| Profile | Key | Limit | Window |
|---------|-----|-------|--------|
| `token_verification` | IP address | 10 attempts | 15 minutes |
| `otp_issuance` | tokenHash (recipient) | 3 issues | 1 hour |
| `otp_verification` | IP address | 10 attempts | 15 minutes |
| `signing_global` | IP address | 60 requests | 1 minute |

OTP verification also has a per-challenge attempt limit (`maxAttempts = 5`) stored in the
database. This persists across process restarts, unlike the in-memory counters.

### Anti-enumeration

- Token not found, token expired, and token revoked all return the same `TokenInvalidError`
  with the same HTTP status and message body: `"This link is invalid or has expired."`
- A small synthetic delay (2–5ms) is applied on token miss to prevent distinguishing
  not-found from expired by response timing.
- OTP verification: wrong code returns `"Incorrect verification code"` with attempts
  remaining, but does NOT reveal the correct code or codeHash.
- Error responses for signing endpoints never include DB IDs, internal state, or
  field-level detail that could assist enumeration.

### Replay protection

- Each signing session is bound to a specific `snapshotId` at creation. A session
  cannot be used against a different offer.
- OTP challenges are single-use: once VERIFIED, re-submission throws `OtpAlreadyVerifiedError`.
- The acceptance step requires a `challengeId` that must be VERIFIED and belong to the
  current session — a challenge from a different session or a prior invalidated challenge
  is rejected.
- The offer transitions to ACCEPTED in the same transaction as AcceptanceRecord creation.
  A second acceptance attempt will find the offer in ACCEPTED (terminal) state and throw
  `OfferAlreadyAcceptedError`.

### What v1 does NOT protect against

- A compromised email inbox (OTP was delivered to the correct address, but someone else
  has access to that inbox)
- Automated OTP guessing below the rate limit — mitigated by 6-digit codes (1-in-1M odds),
  10 attempt limit, and per-IP limits, but not fully eliminated
- A stolen but unexpired token combined with inbox access
- Timing attacks at the network layer (beyond the synthetic delay for token miss)

---

## Certificate Content Specification

See [certificate-spec.md](certificate-spec.md) for the full field-by-field specification.

Summary:
- Certificate content is derived from `AcceptanceRecord` + `OfferSnapshot` only
- `certificateHash` = SHA-256 of the canonical JSON (sorted keys, compact, UTF-8)
- `AcceptanceRecord.snapshotContentHash` copies `OfferSnapshot.contentHash` for
  independence — the certificate can be verified without reading the snapshot
- `storageKey` for documents is never included in the certificate
- The acceptance statement text is server-generated — the client cannot inject it

---

## Certificate Persistence and Verification

### Generation Timing

Certificates are generated **synchronously** in the acceptance request path, immediately
after the `AcceptanceRecord` transaction commits. The flow in `SigningFlowService.accept()`:

```
1. acceptanceService.accept() → writes AcceptanceRecord + OFFER_ACCEPTED event [atomic]
2. certificateService.generateForAcceptance(record.id) → writes AcceptanceCertificate [same request]
3. Return: { acceptanceRecordId, acceptedAt, certificateId }
```

The `certificateId` is returned directly in the acceptance response — there is no polling.

### `issuedAt` Determinism

`CertificatePayloadBuilder.build(recordId, certId, issuedAt: Date)` receives `issuedAt`
as a parameter. The caller (`CertificateService.generateForAcceptance`) sets it once,
stores it in `AcceptanceCertificate.issuedAt`, and passes it to the builder.

**Why this matters:** the certificate hash is computed from the full payload including
`issuedAt`. If `issuedAt` were generated inside the builder (as it was before this fix),
re-running `build()` with the same evidence at a different time would produce a different
hash — making the stored hash unverifiable.

With the explicit parameter:
- `generate`: `issuedAt = new Date()` → stored in DB → hash computed → hash stored
- `verify`:   `issuedAt` read from DB → passed to builder → same hash reproduced

### Idempotency

`generateForAcceptance(recordId)` is idempotent. It checks for an existing certificate
before any DB write. Double-calling (e.g., after a retry) returns the existing
`certificateId` without touching the DB again.

### Verification

`CertificateService.verify(certificateId)` performs two independent checks:

| Check | Mechanism | Failure meaning |
|-------|-----------|-----------------|
| Hash integrity | Rebuild payload from DB evidence with stored `issuedAt`; compare SHA-256 to stored `certificateHash` | Certificate content or DB evidence was tampered with |
| Event chain | `SigningEventService.verifyChain(sessionId)` re-hashes every event in sequence | Signing event log was modified |

Both checks must pass for `valid: true`. `brokenAtSequence` is included in the response
when the chain check fails, indicating the first broken link.

### Circular Dependency Resolution

`CertificatesModule` requires `SigningEventService` (for chain verification).
`SigningModule` requires `CertificateService` (to generate after acceptance).
A direct import would create a cycle.

Resolution: `SigningEventService` is extracted into `SigningEventsModule`, which neither
signing nor certificates "owns". Both modules import it.

```
SigningEventsModule     ← no module-level dependencies
  └── exports SigningEventService

CertificatesModule      imports SigningEventsModule
  └── exports CertificateService

SigningModule           imports SigningEventsModule + CertificatesModule
```

### API Endpoints (Internal, JWT-protected)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/certificates/:id` | Certificate metadata + offer/sender/recipient summary |
| GET | `/api/v1/certificates/:id/verify` | Hash + event chain verification result |
| GET | `/api/v1/certificates/:id/export` | Full canonical payload + `canonicalJson` string |

These endpoints are for the sender dashboard and archiving. They are not accessible to
the recipient (no public unauthenticated certificate endpoint in v1).

### Failure Modes

| Scenario | Behavior |
|----------|----------|
| `generateForAcceptance` called on non-existent record | Prisma throws `NotFoundError`; propagates as 500 |
| `verify` / `exportPayload` called with unknown cert ID | `NotFoundException` → 404 |
| `issuedAt` in DB is different from what was used at generation | Hash mismatch → `valid: false`, `certificateHashMatch: false` |
| Row deleted from `signingEvent` | Chain verification fails at the gap sequence |

---

## Sender Offer Lifecycle

### Overview

The authenticated sender flow runs in parallel to the public signing flow. It is
accessed through the `/dashboard` web UI and the `POST/PATCH/GET /api/v1/offers/*`
endpoints, all protected by JWT bearer auth.

### Offer states (sender view)

```
DRAFT ──► SENT ──► ACCEPTED  [terminal — from recipient acceptance]
                ──► DECLINED  [terminal — from recipient decline]
                ──► EXPIRED   [terminal — background job, future]
                ──► REVOKED   [terminal — sender explicit revoke]
```

**Rule:** any mutation (title, message, expiresAt, recipient, documents) throws
`OfferNotEditableError` (HTTP 409) if the offer is not in `DRAFT` state. This is
enforced centrally in `OffersService.requireDraft()` — controllers do not check status.

### Draft completeness rules

An offer is complete and ready to send when:

1. `title` — non-empty
2. `recipient` row exists with non-empty `email` and `name`

Documents are **optional** in v1. Offers with no attached documents are sendable.

Completeness is validated in `assertOfferIsComplete()` in
`apps/api/src/modules/offers/domain/offer-completeness.ts`. This is the single
authoritative definition — send attempts on incomplete offers throw `OfferIncompleteError`
(HTTP 422) with a `missingFields` array.

### Send-time snapshot creation

When `POST /offers/:id/send` is called:

```
1. Load offer + recipient + documents from DB
2. Assert status == DRAFT
3. Assert offer is complete (assertOfferIsComplete)
4. Compute token expiry = offer.expiresAt ?? now + 30d
5. Generate signing token:
     rawToken = "oa_" + base64url(randomBytes(32))
     tokenHash = SHA-256(rawToken)   ← only this is persisted
6. Compute snapshot contentHash (canonical JSON, sorted keys):
     {
       documents: [{ filename, sha256Hash, storageKey }],  ← sorted by storageKey
       expiresAt, message, senderEmail, senderName, title  ← sorted alphabetically
     }
7. [Atomic $transaction]:
   a. Create OfferSnapshot { title, message, senderName, senderEmail,
                              expiresAt, contentHash, frozenAt=now }
   b. Create OfferSnapshotDocument for each OfferDocument
      (copies filename, storageKey, mimeType, sizeBytes, sha256Hash)
   c. Update OfferRecipient: tokenHash ← SHA-256(rawToken)
                             tokenExpiresAt ← token expiry
                             tokenInvalidatedAt ← null
                             status ← PENDING
   d. Update Offer: status ← SENT
8. [After transaction commit]:
   Send offer link email via EmailPort.sendOfferLink()
   (rawToken embedded in signing URL — never written to DB)
```

**Security note:** `senderName` and `senderEmail` are loaded from the `User` DB record,
not from the request body. The sender cannot inject arbitrary identity into the snapshot.

**Email failure:** if `sendOfferLink` throws after the transaction commits, the offer
is SENT but no email was delivered. In v1 this surfaces as an API 500 error. A retry
mechanism (background job) is the future mitigation.

### Revoke rules

`POST /offers/:id/revoke`:
- Allowed only if `status == SENT`
- Any other status throws `OfferNotRevocableError` (HTTP 409): DRAFT, ACCEPTED,
  DECLINED, EXPIRED, REVOKED are all non-revocable
- Revoke atomically: sets `OfferRecipient.tokenInvalidatedAt = now()` and
  `Offer.status = REVOKED`
- After revoke, the signing link returns 404 (TokenInvalidError) — the recipient
  cannot continue or accept

### Sender ↔ public flow relationship

```
Sender creates DRAFT offer
         │
Sender sends offer
         │
         ├─ OfferSnapshot created (immutable)
         ├─ OfferRecipient token set (hash only)
         └─ Email sent with rawToken in signing URL
                  │
         Recipient opens /sign/:token
                  │  (public flow — no sender involvement)
                  ↓
         Recipient accepts / declines
                  │
         Offer transitions to ACCEPTED/DECLINED
         AcceptanceRecord + AcceptanceCertificate created
```

### Authentication

All sender endpoints require a JWT bearer token. The token is issued by
`POST /api/v1/auth/login` (email + password). In v1:

- No signup UI — users are created via DB seed or admin tooling
- No password reset — future feature
- JWT payload: `{ sub: userId, orgId: organizationId, role: UserRole }`
- Token expiry: 7 days (configured via `JWT_EXPIRY` env var)
- Token stored client-side in `localStorage` as `oa_auth_token`

The `JwtAuthGuard` reads `Authorization: Bearer <token>`, verifies it, and attaches
the decoded payload to `request.user`. The `@CurrentUser()` decorator extracts it in
controllers.

---

## Public Signing UI States

The recipient's signing journey is modelled as a typed `Phase` discriminated union in
`apps/web/src/app/sign/[token]/signing-client.tsx`. The UI renders strictly from this
state — no derived or implicit state.

### Why OTP is deferred until explicit user action

Email security gateways (Proofpoint, Mimecast, Gmail Safe Browsing, etc.) automatically
follow links in incoming emails to scan for malicious content. If `GET /sign/:token`
triggered an OTP send, the scanner would consume the code before the real recipient had a
chance to open the email. The recipient would see "invalid code" on their first attempt.

The fix: `GET /sign/:token` has **no side effects**. It only reads and returns the offer
context. The OTP is issued only in response to `POST /sign/:token/otp` — an action the
scanner never takes. This also gives the recipient time to read the offer content before
committing to the verification step.

### Phase state diagram

```
                         [mount]
                            │
                      fetch context
                            │
               ┌────────────┴────────────┐
               ▼                         ▼
         (fetch error)          (network/unexpected error)
               │                         │
         ┌─────┴──────┐            ┌─────┴─────────┐
         │ 404/410    │            │  already_     │
         │ terminal   │            │  terminal     │
         └────────────┘            └───────────────┘
               │
         ┌─────┴─────────────┐
         ▼                   ▼
   invalid_link         offer_expired
                              │
                        offer_view  ◄──── (normal path)
                              │
                   [user clicks "Continue to Accept"]
                              │
                       otp_requesting
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              otp_entry           (error — stays
                  │                in offer_view)
           [user enters code]
                  │
           otp_verifying
                  │
          ┌───────┴───────────────┐
          ▼                       ▼
     acceptance             otp_error
          │                 (locked: bool)
   [user clicks "I Accept"]
          │
      accepting
          │
      completed ──── [terminal]

   offer_view ──► [user clicks "Decline"] ──► declined [terminal]
```

### Phase inventory

| Phase | Meaning |
|-------|---------|
| `loading` | Context fetch in flight |
| `invalid_link` | Token not found / expired (404) |
| `offer_expired` | Offer past `expiresAt` (410) |
| `already_terminal` | Offer already accepted or declined |
| `offer_view` | Context loaded; recipient reading the offer |
| `otp_requesting` | OTP POST in flight |
| `otp_entry` | OTP delivered; waiting for user to enter code |
| `otp_verifying` | Verify POST in flight |
| `otp_error` | Wrong code or lockout; `locked` flag drives UI |
| `acceptance` | OTP verified; acceptance confirmation screen |
| `accepting` | Accept POST in flight |
| `completed` | Acceptance recorded; `acceptedAt` stored |
| `declined` | Offer declined |

### Key invariants

- `handleContinue()` (OTP issuance) is called **only** from a button click handler — never
  on mount, never on route change, never on re-render.
- `challengeId` is stored in phase state, not in a ref or external variable. It is passed
  explicitly to the accept endpoint.
- `locale` and `timezone` are captured at acceptance-click time via `Intl.DateTimeFormat`
  resolvedOptions — not on page load.
- All API errors produce a typed phase transition; the UI never displays raw error messages
  from the server.

---

## Email Delivery — Development and Test Strategy

### Adapter interface

Email delivery is fully abstracted behind an `EmailPort` interface
(`apps/api/src/common/email/email.port.ts`). The interface has one method:

```typescript
sendOtp(params: OtpEmailParams): Promise<void>
```

The production adapter (not yet implemented) will use Resend. The active v1 adapter is
`DevEmailAdapter`.

### DevEmailAdapter

`apps/api/src/common/email/dev-email.adapter.ts` implements `EmailPort` for local
development and automated tests:

- Stores every `{ email, code, sentAt }` tuple in an in-memory array
- Logs the OTP code to the console so developers can copy-paste it manually
- Exposes `getLastCode(email): string | null` for test assertions — no HTTP call needed
- Exposes `reset()` to clear all stored codes between test cases
- Never makes a network call

### Wiring

`EmailModule` is a `@Global()` NestJS module that provides `EMAIL_PORT` using
`DevEmailAdapter`. Because it is global, `SigningModule` (and any future module that needs
email) does not need to import `EmailModule` explicitly — the token is available
application-wide.

### Switching to production

Replace the provider in `EmailModule`:

```typescript
// email.module.ts
{ provide: EMAIL_PORT, useClass: ResendEmailAdapter }
```

No other code changes required. The `ResendEmailAdapter` only needs to implement
`sendOtp(params)`.

---

## Open Decisions

| # | Decision | Options | Current stance |
|---|----------|---------|----------------|
| 1 | Session TTL | 1h / 4h / 24h | Default 4h; not yet enforced in schema |
| 2 | OTP TTL | 5min / 10min | 10min default; open to plan-based config |
| 3 | Offer link expiry default | 14d / 30d / offer expiresAt | Defaults to offer expiresAt if set, else 30d |
| 4 | Offer expiry mid-session | Reject at accept / allow grace period | Reject immediately at accept step |
| 5 | Certificate PDF generator | Puppeteer / PDFKit / external | Not decided; behind an interface |
| 6 | Background job queue | Bull/BullMQ (Redis) / pg-boss (Postgres) | pg-boss preferred; avoids Redis dependency |
| 7 | Email provider | Resend / SMTP | Resend; abstracted behind interface |
| 8 | Deployment target | Railway / Fly.io / AWS ECS | Not decided; Dockerfile TBD |
| 9 | GDPR data retention | Auto-purge after N years / manual | Not designed; event chain complicates purge |
| 10 | Acceptance statement text | Fixed / configurable per org | Fixed in v1; org-configurable later |
