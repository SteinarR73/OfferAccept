# OfferAccept v1 — Operations Guide

This document covers production environment setup, backup expectations, incident
response basics, known v1 limitations, and pilot/GA gates.

This is a living document. Update it when infrastructure changes.

---

## 1. Production Environment Setup

### Prerequisites

- Node.js ≥ 20 LTS
- PostgreSQL ≥ 15
- A [Resend](https://resend.com) account with a verified sending domain
- HTTPS termination via a reverse proxy (nginx, Caddy, or cloud load balancer)

### Environment variables

All variables must be injected at runtime (not committed to the repo or baked into
container images). Set them via your platform's secrets manager (AWS Secrets Manager,
Doppler, Vercel environment variables, etc.).

```
DATABASE_URL=postgresql://user:password@host:5432/offeraccept?sslmode=require
NODE_ENV=production
API_PORT=3001
JWT_SECRET=<64-char random secret — never reuse dev value>
JWT_EXPIRY=7d
SIGNING_LINK_SECRET=<64-char random secret — never reuse dev value>
WEB_BASE_URL=https://app.offeraccept.com
EMAIL_FROM=noreply@offeraccept.com
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_live_...
```

The application **refuses to start** if:
- `EMAIL_PROVIDER=dev` and `NODE_ENV=production`
- `JWT_SECRET` or `SIGNING_LINK_SECRET` contain the placeholder string `change-me`
- `EMAIL_PROVIDER=resend` without a non-empty `RESEND_API_KEY`

### Generating secrets

```bash
# Generate a 64-char URL-safe secret (suitable for JWT_SECRET or SIGNING_LINK_SECRET)
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Generate separate values for `JWT_SECRET` and `SIGNING_LINK_SECRET`. Never use the
same value for both.

### Database setup

```bash
# Apply all pending migrations (safe for production — uses Prisma's migrate deploy)
npx prisma migrate deploy

# Verify the schema is up to date
npx prisma migrate status
```

`migrate deploy` is idempotent. It applies only migrations that have not been applied yet.
It does NOT drop or modify existing data.

### Create support user

```sql
INSERT INTO users (id, organization_id, email, name, role, hashed_password, email_verified)
VALUES (
  gen_random_uuid(),
  '<internal-org-id>',
  'support@offeraccept.com',
  'Support Staff Name',
  'INTERNAL_SUPPORT',
  '<bcrypt-hash>',
  true
);
```

`INTERNAL_SUPPORT` must only ever be assigned by a database operator. It must never
be assignable through any customer-facing flow. See `docs/support.md` for full details.

### Email provider setup

1. Add the sending domain to Resend and configure SPF, DKIM, DMARC.
2. Verify `EMAIL_FROM` in the Resend dashboard.
3. Confirm a test email is delivered before routing customer traffic.
4. Set up Resend webhooks if you need delivery status push notifications.

---

## 2. Running the API

```bash
# Build
npm run build --workspace=apps/api

# Start (production)
node apps/api/dist/main.js

# Or via the workspace script
npm run start --workspace=apps/api
```

The API starts on `API_PORT` (default 3001). It logs startup errors to stderr. A
successful start prints:

```
API running on http://localhost:3001/api/v1
```

In production, NestJS is configured to log only `warn` and `error` level messages.
Dev-mode `log` level output is suppressed.

---

## 3. Backup and Restore

### What to back up

**Must back up:**
- The PostgreSQL database. All evidence is stored here:
  - `OfferSnapshot` + `OfferSnapshotDocument` — frozen offer content
  - `AcceptanceRecord` — acceptance evidence (statement, verified email, IP, timestamps)
  - `AcceptanceCertificate` — certificate hash and issuedAt
  - `SigningEvent` — event chain for verification

**Not stored in the database (must back up separately if applicable):**
- Document files (PDFs, contracts) stored in S3 or equivalent object storage.
  The database stores only the `sha256Hash` and `storageKey`. If the files are lost,
  certificate hash verification still works but the actual document content cannot
  be presented.

### Backup schedule

- **Minimum:** Daily full backup with point-in-time recovery (PITR) enabled.
- **Recommended:** PITR with 7-day retention for the pilot, 30-day for GA.
- Backups must be stored in a region or account separate from the primary database.

### Restore procedure

1. Restore PostgreSQL to the target point in time.
2. Run `npx prisma migrate status` to confirm migration state is consistent.
3. If restoring to a non-current state, re-apply any migrations that were applied
   after the restore point: `npx prisma migrate deploy`.
4. Verify the restore by calling `GET /health` and `GET /certificates/:id/verify`
   on a known certificate.

### What restore does NOT recover

- In-flight signing sessions that expired before the backup was taken.
- Email delivery attempts that were in-flight at backup time.
- Rate limiter state (in-memory — resets on restart, which is fine).

---

## 4. Incident Response

### P1: Certificate hash mismatch reported

**Symptom:** `GET /certificates/:id/verify` returns `valid: false` with a
`certificateHashMatch: false` anomaly.

**Possible causes:**
1. Database row was modified after the certificate was issued (corruption or attack).
2. The `AcceptanceRecord` or `OfferSnapshot` row was modified.
3. A migration applied an unintentional schema change to an immutable table.

**Investigation:**
1. `GET /support/offers/:offerId/case` → `certificate.verification` — get full anomaly list.
2. Check `AcceptanceCertificate` row directly: compare `certificateHash` to a
   freshly recomputed hash using `GET /certificates/:id/verify`.
3. Check `AcceptanceRecord` row: compare `acceptanceStatement`, `acceptedAt`, `verifiedEmail`
   to what the certificate builder expects.
4. Check `OfferSnapshot`: run `GET /certificates/:id/verify` → `snapshotIntegrity` flag.
5. Check the signing event chain: `eventChainIntegrity` flag.
6. Pull the last point-in-time backup and compare the affected rows.

**Response:**
- Do NOT modify the affected rows. Evidence must be preserved as-is.
- Document all findings in writing before taking any action.
- Involve legal and security if tampering is suspected.

---

### P2: Recipient can't receive the offer link

**Symptom:** Sender reports recipient never received the email.

**Steps:**
1. `GET /support/offers?recipientEmail=<email>` → find the offer.
2. `GET /support/offers/:id/case` → check `deliveryAttempts[0].outcome`:
   - `DELIVERED_TO_PROVIDER`: email was accepted by Resend. Ask recipient to check spam.
   - `FAILED`: delivery failed. Note `failureCode` and `failureReason`.
3. If `FAILED`: `POST /support/offers/:id/resend-link` to retry.
4. Check Resend dashboard for additional delivery events not surfaced by the API.

---

### P3: Recipient can't complete OTP

**Symptom:** Recipient opened the link but never receives the OTP code.

**Steps:**
1. `GET /support/offers/:id/timeline` — look for `OTP_ISSUED` events.
2. `GET /support/offers/:id/case` → `sessions` — check session status and `expiresAt`.
3. If session is `AWAITING_OTP` and not expired:
   `POST /support/sessions/:id/resend-otp` to issue a fresh code.
4. If session is expired: `POST /support/offers/:id/resend-link` to issue a new token.
   The recipient must open the new link to start a fresh session.

---

### P4: Dispute — recipient claims they never accepted

**Steps:** See `docs/support.md` → Scenario A.

Key evidence points:
- `acceptanceRecord.acceptanceStatement` — verbatim text the recipient agreed to.
- `acceptanceRecord.verifiedEmail` — email address verified via OTP.
- `acceptanceRecord.ipAddress` — IP at time of acceptance.
- `certificate.verification.valid` — confirms evidence has not been altered.

---

### P5: API returning 5xx errors

1. Check application logs (`docker logs`, CloudWatch, etc.) for stack traces.
2. Check database connectivity: `GET /health` returns 200 with `db: "ok"` when healthy.
3. Check Resend API status at status.resend.com if email-related.
4. If the error is a missing migration: `npx prisma migrate status` and apply.
5. If the error is a crash loop on startup, check environment variable configuration —
   the app will print the missing/invalid variable to stderr before exiting.

---

## 5. Known Limitations for v1

These are intentional scope decisions, not bugs. They are documented here to set
correct expectations for the pilot.

### Rate limiting is single-process

`RateLimitService` uses an in-memory sliding window. If you run more than one API
process (horizontal scaling, blue-green deploy), each process has its own rate limit
counter. An attacker could distribute requests across processes to exceed effective
limits.

**For v1 pilot:** Run a single API process. This is acceptable for controlled pilot scale.
**Before GA scaling:** Replace `RateLimitService` with a Redis-backed implementation.

### Signing token not invalidated after use

Once a signing link has been used to start a session, the link remains technically
valid (the token is not marked as `tokenInvalidatedAt`). A recipient who reopens the
old link will get the same offer context but cannot start a new session if one is
already completed.

**Risk:** Low for v1. The signing link expires at `tokenExpiresAt`. After acceptance,
all further signing actions are blocked by offer/session state machines.

### No offer expiry background job

Offers with `expiresAt` in the past are rejected at the signing flow level
(`OfferExpiredError`), but their status in the database remains `SENT` until a job
marks them `EXPIRED`. There is no background job for this in v1.

**Impact:** The offer list on the sender dashboard shows `SENT` for expired offers.
**Fix before GA:** Add a scheduled job to batch-update expired offers.

### In-progress acceptance not protected against double-submit

The acceptance endpoint is not idempotent. A client that submits the accept action
twice (e.g., double-click) could encounter a race condition. The state machine guard
(`offer.status !== 'SENT'`) catches the second attempt after the first commits, but
the window between the two DB reads is unprotected.

**Risk:** Low in practice (the window is milliseconds). Acceptable for v1.
**Mitigation if needed:** Add a unique constraint on `sessionId` in `AcceptanceRecord`.

### OTP delivery is best-effort

The OTP email is sent after the `SigningOtpChallenge` row is created. If the email
fails, the challenge still exists in the database. The recipient can ask support to
resend. There is no automatic retry.

### Certificate is not a qualified electronic signature

The acceptance certificate evidences intent and email ownership. It does not
constitute a Qualified Electronic Signature (QES) as defined by eIDAS or equivalent
regulations. Do not use OfferAccept v1 for transactions that legally require QES in
your jurisdiction.

### Document content not served by the API

The API stores document metadata and `sha256Hash`. It does not serve document files.
The frontend is responsible for generating pre-signed URLs or proxying files from
storage. If documents are deleted from storage after the offer is sent, the certificate
remains verifiable (hash still matches) but the original content cannot be retrieved.

---

## 6. Deployment Topology Assumptions

### v1 pilot (controlled, single-org)

- Single API process
- Single PostgreSQL instance with daily backup
- Resend for email
- Static file storage (S3 or equivalent)
- HTTPS via reverse proxy

### Pre-GA requirements

- [ ] Redis for distributed rate limiting
- [ ] Read replica for support queries (if query load grows)
- [ ] Resend webhook integration for delivery callbacks
- [ ] Automated offer expiry job
- [ ] Log aggregation and alerting (Datadog, Sentry, or equivalent)

### GA requirements (not defined yet)

- Multi-region or availability-zone failover
- Certificate archival / long-term storage policy
- Automated compliance reporting
