# OfferAccept — Architecture

## What OfferAccept is

OfferAccept makes it easy for a sender to present a commercial offer and for a recipient to
accept it, and to produce a **verifiable, tamper-evident record** that proves what was
accepted, who accepted it, and when. The trust assertion is:

> *The person who controls the recipient's email inbox agreed to the offer as presented.*

This is the same assurance level as a click-to-accept or an email-reply confirmation —
with significantly stronger auditability.

**It is not** a qualified electronic signature (QES) platform under eIDAS, a biometric
identity service, or a contract management system.

---

## System overview

```mermaid
graph TB
    subgraph Browser
        WEB["Next.js 15<br/>(apps/web)"]
    end

    subgraph "API (NestJS 11)"
        AUTH["Auth module<br/>JWT HttpOnly cookies"]
        OFFERS["Offers module<br/>CRUD + send"]
        SIGNING["Signing module<br/>Public, no JWT"]
        CERTS["Certificates module"]
        BILLING["Billing module<br/>Stripe webhooks"]
        ENTERPRISE["Enterprise module<br/>API keys, webhooks"]
        ORGS["Organizations module<br/>Members, invitations"]
        JOBS["Jobs module<br/>pg-boss"]
        RL["RateLimitModule<br/>Redis sliding-window"]
    end

    subgraph Storage
        PG[("PostgreSQL 16")]
        REDIS[("Redis 7<br/>rate limits")]
        S3[("AWS S3<br/>documents")]
    end

    subgraph External
        RESEND["Resend<br/>(email)"]
        STRIPE["Stripe<br/>(billing)"]
    end

    WEB -- "HttpOnly cookie<br/>credentials:include" --> AUTH
    WEB --> OFFERS
    WEB -- "rawToken in URL" --> SIGNING
    AUTH --> PG
    OFFERS --> PG
    SIGNING --> PG
    CERTS --> PG
    BILLING --> PG
    ORGS --> PG
    JOBS --> PG
    RL --> REDIS
    OFFERS --> S3
    AUTH --> RESEND
    BILLING --> STRIPE
    STRIPE -- "webhook POST" --> BILLING
    JOBS -- "expire offers<br/>send webhooks" --> PG
```

---

## Domain model

### Core entities

```mermaid
erDiagram
    Deal {
        string id
        string status
        string title
    }
    DealRecipient {
        string id
        string dealId
        string email
        string name
        string status
    }
    AcceptanceRecord {
        string id
        string dealRecipientId
        string verifiedEmail
        datetime acceptedAt
        string ipAddress
        string userAgent
    }
    Certificate {
        string id
        string dealId
        string acceptanceRecordId
        string certificateHash
        string canonicalHash
        datetime issuedAt
    }

    Deal ||--|| DealRecipient       : "has one (v1)"
    DealRecipient ||--o| AcceptanceRecord : "produces at most one"
    AcceptanceRecord ||--|| Certificate  : "generates"
    Deal ||--o| Certificate          : "archived by"
```

### Entity descriptions

**Deal** — the mutable operational record for a commercial offer. Progresses through a
defined status lifecycle (`DRAFT → SENT → terminal`). Content is mutable until the deal
is sent, after which the frozen snapshot becomes authoritative.

**DealRecipient** — represents a single intended counterparty for a deal. Owns the
signing token, tracks open/verification status, and is the subject of the
`AcceptanceRecord`. The recipient's email address is verified at acceptance time via OTP,
not assumed from the initial send.

**AcceptanceRecord** — the immutable evidence of a completed acceptance event. Captures
the verified email, timestamp, IP address, user-agent, and locale. Created atomically
with the final state transition; never updated after creation.

**Certificate** — the tamper-evident artifact derived from `AcceptanceRecord` and the
frozen `OfferSnapshot`. The `certificateHash` is a SHA-256 digest of the full canonical
certificate payload; the `canonicalHash` is a lighter 5-field acceptance fingerprint.
Both can be recomputed from stored immutable evidence for independent verification.

### v1 implementation note

`DealRecipient` is a **conceptual entity** in v1. It maps directly to the `OfferRecipient`
table (`offer_recipients` in the database), which carries a `@unique` constraint on
`offerId` — enforcing one recipient per deal for the v1 release.

| Conceptual name | v1 table | v1 constraint |
|-----------------|----------|---------------|
| Deal | `offers` | — |
| DealRecipient | `offer_recipients` | `offerId @unique` (one per deal) |
| AcceptanceRecord | `acceptance_records` | `snapshotId @unique` |
| Certificate | `acceptance_certificates` | `acceptanceRecordId @unique` |

When multi-recipient support is introduced in a future version, `DealRecipient` will
become a first-class table with a many-to-one relationship to `Deal`. The
`AcceptanceRecord → Certificate` chain is already designed for this: it is keyed on
the recipient record, not on the deal directly.

---

## Repository structure

```
offeraccept/
├── apps/
│   ├── api/          NestJS 11 — REST API, business logic
│   └── web/          Next.js 15 — dashboard + public signing flow
├── packages/
│   ├── database/     Prisma 5 schema, migrations, PrismaClient singleton
│   └── types/        Shared TypeScript API contracts (@offeraccept/types)
└── docs/
```

Managed as an npm workspace monorepo with Turborepo 2 for task orchestration.

---

## Bounded contexts

### 1. Identity (`auth`, `organizations`)

Owns: organization creation, user accounts, authentication, role management, invitations.

- `Organization` is the top-level tenant. All offer data is org-scoped.
- `User` has a platform `UserRole` (OWNER / ADMIN / MEMBER / INTERNAL_SUPPORT).
- `Membership` is the canonical org-membership record. A user can belong to multiple orgs.
  The JWT payload reads `orgId` and `orgRole` from the user's **primary Membership**
  (prefers OWNER role, falls back to earliest-created).
- `OrgRole` hierarchy: `OWNER(4) > ADMIN(3) > MEMBER(2) > VIEWER(1)`.
- Auth uses **HttpOnly cookies** (`accessToken` 15 min, `refreshToken` 30 days, rotated).
- Refresh tokens are stored hashed in `RefreshToken` table and rotated on every use.
- Signup creates org + user + membership atomically.

### 2. Offers (`offers`, `offer_documents`, `offer_snapshots`, `offer_snapshot_documents`)

Owns: offer lifecycle and content freezing.

- `Offer` is a mutable operational record (DRAFT → SENT → terminal). Conceptually a **Deal** — see [Domain model](#domain-model).
- `OfferDocument` holds file metadata. File bytes live in S3.
- On send: an `OfferSnapshot` is created atomically. After this point the snapshot owns
  the authoritative content — `Offer` fields are never used for signing or certificates.
- `OfferRecipient` is the v1 implementation of **DealRecipient**. One per offer (`offerId @unique`). Owns the signing token and tracks recipient status through the signing flow.

### 3. Signing (public-facing)

Owns: the DealRecipient's entire journey — token validation, OTP, acceptance, decline.

- All endpoints are **unauthenticated**. The signed URL token is the credential.
- Signing sessions are bound to a specific `OfferSnapshot` and `DealRecipient` at creation.
- Every meaningful action writes an immutable, hash-chained `SigningEvent`.
- OTP verification is required before acceptance.
- Acceptance evidence is captured in an immutable `AcceptanceRecord` keyed on the `DealRecipient`.

### 4. Certificates

Owns: generating and verifying `AcceptanceCertificate` from `AcceptanceRecord`.

- Certificate content is derived from `AcceptanceRecord` + `OfferSnapshot` only.
- Mutable entities (`Offer`, `User`, `Organization`) are never read at certificate time.
- `certificateHash` (SHA-256) allows independent third-party integrity verification.

### 5. Billing

Owns: Stripe webhook ingestion, subscription state, plan enforcement.

- `Subscription` is 1:1 with `Organization`. Stripe is authoritative.
- Other modules call `SubscriptionService.canSendOffer(orgId)` — no direct Stripe coupling.

### 6. Enterprise (`api_keys`, `webhook_endpoints`)

Owns: programmatic API access and outgoing webhooks for customer integrations.

- `ApiKey`: stored as SHA-256 hash; raw key shown exactly once at creation.
- `WebhookEndpoint`: HMAC-SHA256 signed delivery; retry via pg-boss; 10 s timeout.

### 7. Jobs (`jobs`)

Owns: background work via **pg-boss** (Postgres-native queue, no Redis required for jobs).

- `expire-offers`: marks SENT offers past their `expiresAt` as EXPIRED.
- `send-webhook-event`: outgoing webhook delivery with exponential back-off.
- `reset-monthly-usage`: resets `monthlyOfferCount` on the first of each month.

---

## Authentication and session model

```mermaid
sequenceDiagram
    participant Browser
    participant API
    participant Redis
    participant DB

    Browser->>API: POST /auth/login {email, password}
    API->>Redis: check login_attempt rate limit (IP)
    API->>DB: verify credentials, find primary Membership
    API-->>Browser: Set-Cookie: accessToken (HttpOnly, 15m)<br/>Set-Cookie: refreshToken (HttpOnly, 30d, Path=/auth/refresh)<br/>Set-Cookie: oa_sess (non-HttpOnly, indicator only)

    Note over Browser: Subsequent requests include cookies automatically

    Browser->>API: GET /offers (cookie sent)
    API->>API: JwtAuthGuard: verify accessToken cookie
    API-->>Browser: 200 {data}

    Browser->>API: POST /auth/refresh (refreshToken cookie)
    API->>DB: validate RefreshToken hash, rotate
    API-->>Browser: new accessToken cookie + rotated refreshToken cookie

    Browser->>API: POST /auth/logout
    API->>DB: revoke all sessions
    API-->>Browser: Clear-Cookie: accessToken, refreshToken, oa_sess
```

**Key properties:**
- `accessToken`: HttpOnly, SameSite=Strict, Secure (prod), `Path=/`
- `refreshToken`: HttpOnly, SameSite=Strict, Secure (prod), `Path=/api/v1/auth/refresh`
- The `JwtAuthGuard` accepts `Authorization: Bearer` **or** the cookie — supports both
  browser sessions and API key / programmatic access.
- No tokens are stored in `localStorage`. XSS cannot steal sessions.

---

## Rate limiting

Rate limiting uses a **Redis sorted-set sliding-window** implemented in Lua. One Lua script
atomically prunes expired entries, counts, and conditionally increments — no TOCTOU race.

```mermaid
graph LR
    Req["Incoming request"] --> Guard["Controller guard"]
    Guard --> RL["RateLimitService.check()"]
    RL -- "EVAL Lua script" --> REDIS[("Redis")]
    REDIS -- "allowed=1" --> Guard
    REDIS -- "allowed=0" --> ERR["429 Too Many Requests<br/>Retry-After header"]
    REDIS -- "unreachable" --> OPEN["Fail-open<br/>[rate_limit_redis_error] log"]
```

**All API instances share the same Redis**, so limits are globally consistent across
horizontal scaling. Keys expire automatically after `windowMs + 1s`.

| Profile | Key | Limit | Window |
|---------|-----|-------|--------|
| `login_attempt` | IP | 10 | 15 min |
| `login_attempt_burst` | IP | 3 | 10 s |
| `forgot_password` | IP | 3 | 1 hour |
| `signup_attempt` | IP | 5 | 1 hour |
| `signup_attempt_burst` | IP | 2 | 30 s |
| `token_verification` | IP | 10 | 15 min |
| `otp_issuance` | tokenHash | 3 | 1 hour |
| `otp_verification` | IP | 10 | 15 min |
| `otp_verification_burst` | IP | 3 | 10 s |
| `signing_global` | IP | 60 | 1 min |
| `cert_verify` | IP | 10 | 1 min |
| `invite_attempt` | userId | 10 | 1 hour |
| `invite_accept_attempt` | IP | 5 | 15 min |
| `support_resend_otp` | sessionId | 3 | 5 min |
| `support_resend_link` | actorId | 5 | 10 min |

OTP verification also has a **database-persisted** per-challenge attempt limit (`maxAttempts=5`)
that survives process restarts — unlike the Redis counters.

---

## Multi-tenant isolation

```mermaid
graph TD
    Request --> Guard["JwtAuthGuard<br/>extracts orgId from JWT"]
    Guard --> Service["Service method"]
    Service --> Query["Prisma query<br/>WHERE organizationId = orgId"]
    Query --> DB[("PostgreSQL")]
```

- Every authenticated service method scopes queries to `orgId` from the JWT.
- `OrgRoleGuard` enforces minimum `OrgRole` per endpoint using `@MinOrgRole()` metadata.
- `ApiKeyGuard` resolves `orgId` from the `ApiKey` row — same isolation applies.
- Cross-tenant access is impossible without a valid token for that org.
- `test/offers/tenant-isolation.spec.ts` verifies this at the integration level.

---

## Signing trust model

### Email link + OTP rationale

The email link alone proves *someone* with inbox access opened the link — not that the
intended person was present at acceptance time. Links can be forwarded or pre-loaded by
email security scanners.

The OTP step sends a time-limited code to the same inbox **at the moment of acceptance**,
proving live inbox control. It also creates an independently timestamped audit event
(OTP delivery) separate from the link click.

**Email link = identifies the session. OTP = verifies inbox control at acceptance time.**

### OTP deferred until user action

Email security gateways (Proofpoint, Mimecast, Gmail Safe Browsing) automatically follow
links in incoming emails. If `GET /sign/:token` triggered an OTP, the scanner would
consume the code before the real recipient saw it.

`GET /sign/:token` has **no side effects** — it only reads offer context. The OTP is
issued only via `POST /sign/:token/otp`, which scanners never call.

### Token design

| Property | Detail |
|----------|--------|
| Format | `oa_<base64url(32 random bytes)>` — 256-bit entropy |
| Storage | Only `SHA-256(rawToken)` stored in DB; raw token never persisted |
| Lookup | `WHERE tokenHash = SHA256(incoming) AND tokenExpiresAt > NOW() AND tokenInvalidatedAt IS NULL` |
| Re-use | Token is not single-use; recipient can re-open link on a second device |
| Invalidation | `tokenInvalidatedAt` set on revoke or explicit cancellation |

### OTP design

| Property | Detail |
|----------|--------|
| Code | 6-digit numeric, `crypto.randomInt(100000, 999999)` |
| Storage | Only `SHA-256(code)` stored; raw code delivered by email only |
| TTL | 10 minutes |
| Attempt limit | 5 per challenge (DB-persisted); locked → `OTP_MAX_ATTEMPTS` event |
| Re-issue | New OTP invalidates all prior challenges for the session |

---

## Frozen offer snapshot

When an offer transitions from DRAFT to SENT, an `OfferSnapshot` is created atomically:

```mermaid
graph LR
    Offer["Offer (mutable)"] -- "send" --> TX["$transaction"]
    TX --> Snapshot["OfferSnapshot (immutable)"]
    TX --> Docs["OfferSnapshotDocuments"]
    TX --> Token["tokenHash on OfferRecipient"]
    TX --> Status["Offer.status = SENT"]
```

After the transaction, the snapshot owns all content used for signing and certification.
`Offer.title`, `Offer.message`, etc. can be edited cosmetically with no effect on the
signing flow or certificate.

**contentHash** = SHA-256 of this canonical JSON (keys sorted, no whitespace, UTF-8):
```json
{
  "documents": [{ "filename": "...", "sha256Hash": "...", "storageKey": "..." }],
  "expiresAt": "...",
  "message": "...",
  "senderEmail": "...",
  "senderName": "...",
  "title": "..."
}
```
Documents are ordered by `storageKey`. `senderName`/`senderEmail` come from the `User`
DB record — the sender cannot inject arbitrary identity via the request body.

---

## Signing event hash chain

Every signing action writes an immutable, chained `SigningEvent`:

```
eventHash = SHA-256(
  sessionId | sequenceNumber | eventType | canonicalPayload | timestamp.toISOString()
  | (previousEventHash ?? "GENESIS")
)
```

- `@@unique([sessionId, sequenceNumber])` prevents forked chains at the DB level.
- Chain verification re-hashes every event in order; a missing or mutated row breaks the chain.
- `brokenAtSequence` is returned when verification fails.

**Limitation:** the chain detects tampering at rest but does not prevent a compromised
application from appending fraudulent events. An external timestamp authority (RFC 3161)
would be required for that — out of scope for v1.

---

## Certificate derivation

```mermaid
graph TB
    AR["AcceptanceRecord (immutable)<br/>acceptanceStatement, verifiedEmail,<br/>emailVerifiedAt, acceptedAt,<br/>ipAddress, userAgent, locale,<br/>timezone, snapshotContentHash"]
    OS["OfferSnapshot (immutable)<br/>title, message, senderName,<br/>senderEmail, expiresAt, contentHash<br/>+ OfferSnapshotDocuments"]

    AR --> Gen["CertificatePayloadBuilder"]
    OS --> Gen
    Gen --> Hash["SHA-256 of canonical JSON<br/>(sorted keys, UTF-8, no whitespace)"]
    Hash --> Cert["AcceptanceCertificate<br/>certificateHash, issuedAt"]
```

`issuedAt` is set once by the caller and passed to the builder — ensuring the hash is
deterministic and re-computable from stored evidence. The certificate generator never
reads `Offer`, `User`, or `Organization`.

---

## Request flows

### Creating and sending an offer

```
Sender (JWT cookie)
  │
  ├─ POST /offers                             Create Offer (DRAFT)
  ├─ POST /offers/:id/documents/upload-url    Get presigned S3 URL
  ├─ PUT  <presignedUrl>                      Browser → S3 directly
  ├─ POST /offers/:id/documents               Register document + SHA-256
  └─ POST /offers/:id/send
         │
         ├─ Assert DRAFT + complete
         ├─ Create OfferSnapshot + SnapshotDocuments  [atomic]
         ├─ rawToken = "oa_" + base64url(randomBytes(32))
         │  tokenHash = SHA-256(rawToken)  ← only hash persisted
         ├─ Offer.status = SENT
         └─ Email: rawToken in signing URL (never written to DB)
```

### Signing flow (recipient)

```
1. GET  /signing/:token          Validate token (read-only; no OTP issued here)
                                 Create SigningSession → SESSION_STARTED event

2. POST /signing/:token/otp/request
        code = crypto.randomInt(100000, 999999)
        Store SHA-256(code), send code via email → OTP_ISSUED event

3. POST /signing/:token/otp/verify  { challengeId, code }
        Verify SHA-256(code) == stored hash
        On success: session.status = OTP_VERIFIED → OTP_VERIFIED event

4. POST /signing/:token/accept  { challengeId, locale, timezone }
        Require OTP_VERIFIED + challenge belongs to this session
        [Atomic $transaction]:
          AcceptanceRecord created
          session, recipient, offer → ACCEPTED
          OFFER_ACCEPTED event (final in chain)
        → certificateService.generateForAcceptance() [same request]
        → Return: { acceptedAt, certificateId }
```

---

## State machines

### Offer

```
DRAFT ──────────────────────────────► SENT
                                        │
                    ┌───────────────────┼──────────────┬────────────┐
                    ▼                   ▼              ▼            ▼
                ACCEPTED            DECLINED        EXPIRED      REVOKED
              [terminal]           [terminal]      [terminal]  [terminal]
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
        ──► LOCKED      [terminal]   (maxAttempts reached)
        ──► INVALIDATED [terminal]   (superseded by new OTP)
```

---

## DealRecipient status derivation

The recipient-facing status of a deal is **derived deterministically from the
`DealEvent` log**. There is no stored status field for recipient engagement — the status
is computed at read time by inspecting which lifecycle events exist for the deal.

### Derivation rules

Rules are evaluated in priority order. The first matching rule wins.

| Priority | Status | Condition |
|----------|--------|-----------|
| 1 (highest) | `accepted` | `deal.accepted` event exists |
| 2 | `otp_verified` | `otp.verified` exists **and** `deal.accepted` does not |
| 3 | `opened` | `deal.opened` exists **and** `otp.verified` does not |
| 4 (default) | `never_opened` | no `deal.opened` event exists |

### Invariants

- The statuses are **mutually exclusive**: exactly one applies at any point in time.
- The statuses are **monotonically advancing**: a deal can move from `never_opened` →
  `opened` → `otp_verified` → `accepted`, but never backwards.
- No status is stored. Re-evaluating the same event set always produces the same result.
  Two independent callers with the same event log will always agree.

### Why events, not a status field

A stored status field can diverge from the event log if a write fails or is skipped. A
derived status cannot — it is always consistent with the evidence that actually exists.
This matters most for the `accepted` status, which triggers certificate issuance; if the
event is present, the derivation is `accepted` regardless of any other field.

### Derivation pseudocode

```
function deriveRecipientStatus(events: DealEventType[]): RecipientStatus {
  if events.includes('deal.accepted')  → return 'accepted'
  if events.includes('otp.verified')   → return 'otp_verified'
  if events.includes('deal.opened')    → return 'opened'
  return 'never_opened'
}
```

### Relationship to `Offer.status`

`Offer.status` is a **separate, database-stored** state machine covering the full deal
lifecycle including sender-initiated transitions (`DRAFT`, `SENT`, `REVOKED`, `EXPIRED`).
Recipient-derived status is orthogonal: it tracks how far the recipient has progressed
within the `SENT` phase, independently of sender actions.

| `Offer.status` | Recipient status can be |
|----------------|------------------------|
| `DRAFT` | — (no events; not applicable) |
| `SENT` | `never_opened`, `opened`, `otp_verified` |
| `ACCEPTED` | `accepted` |
| `DECLINED` | `otp_verified` or `opened` (declined before completing) |
| `EXPIRED` | any (expiry is a sender-side terminal state) |
| `REVOKED` | any (revocation is sender-initiated) |

---

## Module dependency graph

```mermaid
graph TD
    App["AppModule"]
    App --> Auth["AuthModule"]
    App --> Offers["OffersModule"]
    App --> Signing["SigningModule"]
    App --> Certs["CertificatesModule"]
    App --> Billing["BillingModule"]
    App --> Enterprise["EnterpriseHttpModule"]
    App --> Orgs["OrganizationsModule"]
    App --> Jobs["JobsModule"]
    App --> Health["HealthModule"]

    subgraph Global
        DB["DatabaseModule"]
        RL["RateLimitModule (Redis)"]
        Email["EmailModule"]
        Config["ConfigModule"]
    end

    Auth --> DB
    Offers --> DB
    Signing --> DB
    Signing --> SignEvents["SigningEventsModule"]
    Certs --> DB
    Certs --> SignEvents
    Signing --> Certs
    Billing --> DB
    Orgs --> DB
    Jobs --> DB
    Enterprise --> DB
    EnterpriseCore["EnterpriseCoreModule"] --> Jobs
    Enterprise --> EnterpriseCore
    Enterprise --> Orgs
```

`SigningEventsModule` is extracted specifically to break the circular dependency between
`SigningModule` (needs `CertificateService`) and `CertificatesModule` (needs
`SigningEventService`).

---

## Email delivery

Email is abstracted behind `EmailPort`. Switch providers by changing the module binding:

| Provider | Class | When |
|----------|-------|------|
| `dev` | `DevEmailAdapter` | Local dev and tests (in-memory, prints to console) |
| `resend` | `ResendEmailAdapter` | Production (Resend API) |

`DevEmailAdapter` exposes `getLastCode(email)` and `reset()` for test assertions — no
HTTP calls, no network dependency.

`EMAIL_PROVIDER=dev` is **blocked at startup** in `NODE_ENV=production`.

---

## Abuse protection

### What is protected

| Threat | Control |
|--------|---------|
| Credential stuffing | `login_attempt` + `login_attempt_burst` rate limits |
| OTP brute force | 5-attempt DB limit + `otp_verification` / `otp_verification_burst` RL |
| Token enumeration | All token errors return identical response (`"This link is invalid or has expired."`) |
| Timing oracle on token miss | 2–5 ms synthetic delay applied on miss |
| OTP replay | Challenge `VERIFIED` → re-submission throws `OtpAlreadyVerifiedError` |
| Concurrent acceptance race | Offer transitions in atomic transaction; ACCEPTED is terminal |
| Cross-org data access | JWT-scoped queries; `OrgRoleGuard` on all org endpoints |
| XSS session theft | HttpOnly cookies; no tokens in `localStorage` |
| CSRF | SameSite=Strict cookies |
| Clickjacking / injection | Helmet headers (CSP, X-Frame-Options, HSTS) |

### What is not protected (v1 known limitations)

- Compromised email inbox (OTP delivered to correct address, different person has access)
- Automated OTP guessing below rate limit per account (mitigated but not eliminated)
- Stolen unexpired token + inbox access (window ≤ 4h session + 10 min OTP TTL)
- External timestamp authority for signing event chain

---

## Open decisions

| # | Decision | Status |
|---|----------|--------|
| 1 | Certificate PDF generator | Not implemented; behind interface (Puppeteer / PDFKit) |
| 2 | GDPR data retention | Not designed; event chain complicates anonymization |
| 3 | Acceptance statement text | Fixed in v1; org-configurable planned |
| 4 | Multi-org switching UI | Stub in `OrgSelector`; API `POST /auth/switch-org` planned |
| 5 | QES-tier identity verification | Out of scope for v1 |
| 6 | Multi-recipient deals (DealRecipient v2) | `OfferRecipient.offerId @unique` dropped; DealRecipient becomes many-to-one; `AcceptanceRecord` and `Certificate` chain already keyed correctly |

---

## Related documents

| Document | Contents |
|----------|----------|
| [certificate-spec.md](certificate-spec.md) | Full field-by-field certificate specification |
| [delivery.md](delivery.md) | Offer delivery states and resend semantics |
| [email.md](email.md) | Email adapter configuration |
| [operations.md](operations.md) | Production setup, backup, incident response |
| [support.md](support.md) | Support API, dispute workflow |
| [launch-gates.md](launch-gates.md) | Pre-launch checklist (Gate 1–6) |
