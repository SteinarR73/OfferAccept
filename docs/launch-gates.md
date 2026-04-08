# OfferAccept v1 — Launch Readiness Gates

This document is the canonical pre-launch checklist. Every item here must be verified
before routing real customer traffic. Items are organized into gates. The system should
not proceed to the next gate until all items in the current gate pass.

Items marked **[CODE]** are enforced by the application itself.
Items marked **[OPS]** require infrastructure or operator verification.
Items marked **[LEGAL]** require sign-off from legal/compliance — code cannot enforce these.
Items marked **[PILOT]** are acceptable to defer until controlled pilot is underway.

---

## Gate 1 — Correctness (must pass before any testing)

### 1.1 Acceptance statement single source of truth **[CODE]**
- [x] `buildAcceptanceStatement` in `signing/domain/acceptance-statement.ts` is the
      only implementation. Both `SigningFlowService.getOfferContext` (display) and
      `AcceptanceService.accept` (storage) import from this module.
- [x] Test: `test/signing/acceptance-statement.spec.ts` passes. Display and stored text
      are byte-for-byte identical.
- [x] CI: `gate-tests` job runs `pnpm test:gates` and blocks build on failure. Added 2026-04-08.

**Why this matters:** If the text shown to the recipient differs from the text stored in
the certificate, the certificate is not evidence of what the recipient agreed to.

### 1.2 Certificate hash determinism **[CODE]**
- [x] `AcceptanceCertificate.issuedAt` is generated once in `CertificateService.generateForAcceptance`
      and stored in the DB row. The builder never calls `new Date()` internally.
- [x] `builder.build(acceptanceRecordId, certificateId, issuedAt)` called with the stored
      `issuedAt` always produces the same `certificateHash`.
- [x] Test: `test/certificates/certificate-hash.spec.ts` passes.
- [x] CI: covered by `gate-tests` job. Added 2026-04-08.

### 1.3 No side effects on GET signing endpoints **[CODE]**
- [ ] `GET /signing/:token` (getOfferContext) does NOT create a session.
- [ ] `GET /signing/:token` does NOT issue an OTP.
- [ ] Only POST actions trigger session creation and OTP issuance.

**Why this matters:** Email security scanners follow links. A side-effectful GET would
consume the OTP before the real recipient sees it.

### 1.4 Immutable evidence protection **[CODE]**
- [ ] `OfferSnapshot` rows are never updated after creation.
- [ ] `AcceptanceRecord` rows are never updated after creation.
- [ ] `SigningEvent` rows are never updated or deleted.
- [ ] `AcceptanceCertificate.certificateHash` is set once and never overwritten.
- [ ] Support actions (`POST /support/.../revoke`, `resend-link`, `resend-otp`) touch
      only mutable state (Offer.status, OfferRecipient.token, new SigningEvent append).

---

## Gate 2 — Security (must pass before pilot)

### 2.1 No raw token or OTP logging **[CODE]**
- [ ] `ResendEmailAdapter.sendOtp` does NOT log `params.code`.
- [ ] `ResendEmailAdapter.sendOfferLink` does NOT log `params.signingUrl`.
- [ ] Test: `test/logging/logging-redaction.spec.ts` source-level assertion passes.
- [ ] No logger call in the entire `apps/api/src` tree contains a variable named
      `rawToken`, `rawCode`, `signingUrl`, or `params.code`.

### 2.2 Production env guards at startup **[CODE]**
- [ ] `EMAIL_PROVIDER=dev` is rejected when `NODE_ENV=production`. The app refuses to start.
- [ ] `JWT_SECRET` containing `change-me` is rejected in production.
- [ ] `SIGNING_LINK_SECRET` containing `change-me` is rejected in production.
- [ ] `RESEND_API_KEY` is required when `EMAIL_PROVIDER=resend`.
- [ ] Test: `test/logging/logging-redaction.spec.ts` env-guard tests pass.

### 2.3 Rate limiting is active on all signing endpoints **[CODE]**
- [ ] `GET /signing/:token` — `token_verification` profile (10 per IP per 15 min).
- [ ] `POST /signing/:token/otp` — `otp_issuance` profile (3 per token per hour)
      AND `signing_global` (60 per IP per min).
- [ ] `POST /signing/:token/otp/verify` — `otp_verification` profile (10 per IP per 15 min).
- [ ] `POST /signing/:token/accept` — `signing_global` profile.
- [ ] Rate limiter is in-process (single-process deployment only). For multi-process
      deployments, a Redis-backed implementation is required — see Known Limitations.

### 2.4 Token security **[CODE]**
- [ ] Signing tokens use 256 bits of entropy (`crypto.randomBytes(32).toString('base64url')`).
- [ ] Only `tokenHash = SHA-256(rawToken)` is stored. Raw token appears only in the email link.
- [ ] `tokenInvalidatedAt` is set on revoke; expired tokens (`tokenExpiresAt < now`) are rejected.
- [ ] Token lookup via `WHERE tokenHash = SHA256(input)` — not `WHERE token = input`.

### 2.5 OTP security **[CODE]**
- [ ] 6-digit numeric OTP; `crypto.randomInt(100_000, 1_000_000)` (uniform distribution).
- [ ] Only `codeHash = SHA-256(rawCode)` is stored. Raw code is never persisted.
- [ ] OTP has a 10-minute TTL. Expired challenges are rejected.
- [ ] Max 5 failed attempts before lockout (`OTP_LOCKED` status).
- [ ] A single OTP issuance rate-limited at 3 per token per hour.

### 2.6 Auth guard placement **[CODE]**
- [ ] All `/offers/*` routes require `JwtAuthGuard` (OffersController).
- [ ] All `/support/*` routes require `InternalSupportGuard` (extends JwtAuthGuard,
      adds `role === INTERNAL_SUPPORT` check).
- [ ] `GET /certificates/:id/verify` is intentionally public (no guard). Confirmed in
      `CertificatesController` — `@UseGuards` applied per-route on `:id` and `:id/export` only.
- [ ] Support routes return 403 (not 401) for valid-JWT callers without `INTERNAL_SUPPORT` role.

### 2.7 Tenant isolation **[CODE]**
- [x] All offer queries include `organizationId: orgId` in the WHERE clause.
- [x] `SendOfferService.resend` and `.revoke` validate org ownership before acting.
- [x] `GET /support/*` routes are intentionally cross-org (INTERNAL_SUPPORT only).
- [x] Test: `test/offers/tenant-isolation.spec.ts` passes.
- [x] CI: covered by `gate-tests` job. Added 2026-04-08.

### 2.8 CORS configuration **[OPS]**
- [ ] `WEB_BASE_URL` in production points to the real web origin.
- [ ] The API does NOT use `origin: '*'`. The origin is set to `WEB_BASE_URL`.
- [ ] Verify with `curl -H "Origin: https://evil.example.com" ...` — must not return
      `Access-Control-Allow-Origin: https://evil.example.com`.

### 2.9 x-forwarded-for trust **[OPS]**
- [ ] If deployed behind a load balancer or reverse proxy, the proxy is the only entity
      that can set `x-forwarded-for`. The signing controller trusts the first IP in
      this header for rate limiting.
- [ ] If not behind a trusted proxy, `x-forwarded-for` can be spoofed to bypass
      per-IP rate limits. For v1 controlled pilot, this is an acceptable known
      limitation — document the deployment topology.

---

## Gate 3 — Environment and Infrastructure (must pass before pilot)

### 3.1 Required environment variables set **[OPS]**
All variables must be set in the production environment (not `.env` file in the container):

| Variable | Requirement |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string with SSL |
| `JWT_SECRET` | ≥32 chars, not placeholder, rotated from dev value |
| `SIGNING_LINK_SECRET` | ≥32 chars, not placeholder, rotated from dev value |
| `WEB_BASE_URL` | Exact production web origin (used for CORS) |
| `EMAIL_FROM` | Verified sender address with SPF/DKIM configured |
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | Live Resend API key (not test key) |

### 3.2 Database **[OPS]**
- [ ] All Prisma migrations applied (`npx prisma migrate deploy`).
- [ ] Database has daily automated backups with tested restore procedure.
- [ ] `DATABASE_URL` uses SSL (`sslmode=require` or connection URL `?ssl=true`).
- [ ] `INTERNAL_SUPPORT` user created in the database for OfferAccept staff.

### 3.3 Email provider **[OPS]**
- [ ] Resend account is on a paid plan (free tier has daily send limits).
- [ ] Sender domain has SPF, DKIM, and DMARC records configured.
- [ ] `EMAIL_FROM` address is verified in the Resend dashboard.
- [ ] Resend webhook is configured if email delivery status callbacks are needed.

### 3.4 Storage **[OPS]**
- [ ] For v1, documents are referenced by `storageKey` only; the API does not serve file
      content directly. Verify that document download URLs are generated by the frontend
      using pre-signed S3 URLs (or equivalent) — the API never proxies raw file bytes.
- [ ] S3 bucket is private (no public read). Pre-signed URL TTL is appropriate.
- [ ] `sha256Hash` in `OfferSnapshotDocument` is verified against the stored file for at
      least one representative upload to confirm integrity.

### 3.5 TLS / HTTPS **[OPS]**
- [ ] API is served over HTTPS only. HTTP redirects to HTTPS.
- [ ] TLS certificate is valid and auto-renewing.
- [ ] `Strict-Transport-Security` header is set by the reverse proxy.

---

## Gate 4 — Legal and Compliance (must pass before GA)

These items require human sign-off. Code cannot enforce them.

### 4.1 Acceptance statement legal review **[LEGAL]**
- [ ] Legal has reviewed the acceptance statement template in
      `signing/domain/acceptance-statement.ts`.
- [ ] Legal has confirmed the statement is appropriate for the jurisdiction(s) of
      the pilot customers.
- [ ] Legal has confirmed that email OTP verification is sufficient evidence of identity
      for the intended use cases in the pilot jurisdiction(s).

**Note:** OTP verification proves email control, not legal identity. The certificate
does not constitute a qualified electronic signature (QES) under eIDAS or equivalent
regulations. It is evidence of intent and email ownership. Legal sign-off should
explicitly acknowledge this scope.

### 4.2 Privacy / data handling **[LEGAL]**
- [ ] Privacy policy covers the data collected: email addresses, IP addresses,
      user agents, locale/timezone, acceptance statements.
- [ ] Data retention policy covers `AcceptanceRecord` and `SigningEvent` data.
- [ ] If pilot customers are EU-based, GDPR lawful basis for processing acceptance
      evidence has been established.

### 4.3 Terms of service **[LEGAL]**
- [ ] Sender-facing ToS covers the intended use of OfferAccept for binding agreements.
- [ ] ToS explicitly states what the certificate proves and does not prove.

---

## Gate 5 — Pilot readiness (before first customer)

### 5.1 Support tooling operational **[OPS]**
- [ ] At least one `INTERNAL_SUPPORT` user exists in the production database.
- [ ] Support staff have reviewed `docs/support.md` and the dispute workflow scenarios.
- [ ] Support staff can successfully call `GET /support/offers?recipientEmail=...`
      and `GET /support/offers/:id/case` against the production database.

### 5.2 Monitoring **[OPS]** **[PILOT]**
- [ ] Application errors (5xx responses) trigger alerts.
- [ ] Rate limit exceeded (429 responses) are logged and monitored.
- [ ] Email delivery failures are surfaced via Resend webhook or periodic delivery
      history check.

### 5.3 Runbook exists **[OPS]**
- [ ] `docs/operations.md` has been reviewed by the on-call team.
- [ ] Incident response steps are known: who to call, what to check, how to roll back.

---

## Gate 6 — GA readiness (after successful pilot)

### 6.1 Rate limiting — multi-process **[OPS]**
- [ ] If horizontally scaling beyond a single API process, replace `RateLimitService`
      with a Redis-backed implementation. The current in-process store does not share
      state across processes.

### 6.2 Offer token expiry rotation **[OPS]**
- [ ] A background job or cron exists to transition `SENT` offers where
      `tokenExpiresAt < now` to `EXPIRED` status, or the frontend handles the
      `OfferExpiredError` response gracefully.

### 6.3 Load test **[OPS]**
- [ ] The signing flow has been load-tested at anticipated peak concurrency.
- [ ] Database connection pool size is appropriate for the observed query rate.

### 6.4 Certificate verification public endpoint **[OPS]**
- [ ] `GET /certificates/:id/verify` is accessible without authentication.
- [ ] Third-party verification instructions in `docs/certificates.md` have been
      validated by an external reviewer who followed the steps independently.

---

## Quick reference: what the code enforces vs. what it cannot

| Concern | Enforced by code? | How |
|---------|------------------|-----|
| Acceptance statement uniqueness | Yes | Single shared function |
| Certificate determinism | Yes | issuedAt stored, passed to builder |
| No OTP logging in production | Yes | Guard comments + redaction tests |
| Email_provider != dev in production | Yes | env.ts refine |
| Placeholder secrets rejected in production | Yes | env.ts refine |
| Tenant isolation | Yes | orgId in all WHERE clauses |
| Immutable evidence (snapshot, record, events) | Yes | No update/delete paths |
| Rate limiting | Yes (single-process) | RateLimitService |
| Legal review of statement text | No | Human sign-off required |
| GDPR basis for data collection | No | Human sign-off required |
| Database backups | No | OPS responsibility |
| TLS enforcement | No | Reverse proxy responsibility |
| x-forwarded-for trust validation | No | Deployment topology dependent |
