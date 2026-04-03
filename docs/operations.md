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

### P6: Reminder emails not being sent

**Symptom:** Senders report no reminders received; activity feed shows no `deal_reminder_sent`
events after 24 h, 72 h, or 5 days.

**How reminders work:**

- A `ReminderSchedule` row is created at send time with `nextReminderAt` set to 24 h after send.
- The `send-reminders` pg-boss job runs every 5 minutes and sweeps for due schedules.
- Each sent reminder increments `reminderCount` and advances `nextReminderAt`.
- If the offer reaches a terminal state (`ACCEPTED`, `REVOKED`, `EXPIRED`), the schedule
  row is deleted on the next sweep (self-healing).
- Reminder emails are sent only when `offer.status === 'SENT'`.

**Diagnosis steps:**

1. Check whether the pg-boss worker is running: look in logs for
   `[JobWorker]` startup messages. If absent, the worker did not register.

2. Confirm the `send-reminders` queue is processing jobs:
   ```sql
   SELECT name, state, created_on, completed_on, fail_count
   FROM pgboss.job
   WHERE name = 'send-reminders'
   ORDER BY created_on DESC
   LIMIT 10;
   ```
   Jobs in `failed` state with non-zero `fail_count` indicate repeated handler errors.

3. Check for stale `ReminderSchedule` rows:
   ```sql
   SELECT rs.id, rs.offer_id, rs.next_reminder_at, rs.reminder_count,
          o.status
   FROM reminder_schedules rs
   JOIN offers o ON o.id = rs.offer_id
   WHERE rs.next_reminder_at <= NOW()
     AND o.status = 'SENT'
   ORDER BY rs.next_reminder_at ASC
   LIMIT 20;
   ```
   Rows here that are not being processed indicate the job runner is stuck.

4. Look for email delivery failures in logs: search for
   `[SendRemindersHandler] Failed to send reminder`.

**Recovery steps:**

- If the job worker is down: restart the API process. The worker re-registers
  on startup and will process overdue schedules on the next sweep.
- If a specific reminder failed due to an email delivery error: the schedule
  is NOT advanced, so the next sweep will retry automatically.
- If the `ReminderSchedule` row is corrupted: manually delete and re-create it,
  or use `POST /support/offers/:id/resend-link` to issue a fresh email to the
  recipient as an alternative.
- If Resend is degraded: check status.resend.com. Remind senders that the email
  provider is experiencing issues; reminders will self-recover on the next sweep
  once delivery succeeds.

---

### P7: OTP abuse detected

**Symptom:** Rate-limit alerts fire on OTP endpoints; support inbox receives reports of
unsolicited OTP codes; abnormally high `OTP_ISSUED` or `OTP_ATTEMPT_FAILED` events in logs.

**OTP security controls in place:**

- `POST /signing/:token/otp` — 3 issuances per token per hour (`otp_issuance` profile)
  and 60 per IP per minute (`signing_global` profile).
- `POST /signing/:token/otp/verify` — 10 per IP per 15 min (`otp_verification` profile);
  5 failed attempts locks the challenge (`OTP_LOCKED` status).
- All limits are logged at `WARN` level when exceeded (HTTP 429).

**Diagnosis steps:**

1. Search logs for HTTP 429 responses on `/signing/` paths. Cluster by IP address and
   token prefix to identify the attack source.

2. Query for locked challenges:
   ```sql
   SELECT soc.id, soc.offer_recipient_id, soc.status, soc.attempt_count,
          soc.created_at, or.email
   FROM signing_otp_challenges soc
   JOIN offer_recipients or ON or.id = soc.offer_recipient_id
   WHERE soc.status = 'OTP_LOCKED'
     AND soc.created_at > NOW() - INTERVAL '1 hour'
   ORDER BY soc.created_at DESC;
   ```

3. Check whether the targeted tokens belong to real offers (org-owned) or are
   random guesses. A high ratio of `NotFoundException` errors on `/signing/:token`
   suggests token enumeration, not targeted attacks.

4. Determine if the same IP is abusing multiple offers (broad OTP flooding) vs.
   targeting one specific recipient (targeted credential attack).

**Response steps:**

- **Rate limit exceeded (429) on OTP issuance for a real recipient:**
  The recipient is temporarily blocked. They can retry after the rate-limit window
  resets (1 hour per token). Use `POST /support/sessions/:id/resend-otp` to manually
  issue a fresh code on the recipient's behalf if the window is unacceptable.

- **OTP locked challenge for a real recipient:**
  The challenge is locked after 5 failed attempts. Issue a fresh session:
  `POST /support/offers/:id/resend-link` — this invalidates the current token
  and creates a new signing URL that resets the session.

- **Ongoing flood from a specific IP:**
  Block the IP at the reverse proxy level (nginx, Cloudflare, load balancer).
  The in-process rate limiter will recover normally after the block is in place.

- **Suspected targeting of a specific offer:**
  Notify the offer sender that someone may be attempting to brute-force their
  recipient's acceptance link. Consider revoking the offer (`POST /support/offers/:id/revoke`)
  and reissuing it to the recipient directly via a new send.

- **Suspected bot or automated attack across many offers:**
  Escalate to engineering to evaluate IP-level blocks and consider temporarily
  tightening the `otp_issuance` rate limit profile in `RateLimitService`.

---

### P8: Background job failures

**Symptom:** Jobs appear in the pg-boss `failed` state; processing is delayed or stopped;
certificates not being issued after acceptance; reminders not going out.

**pg-boss job state lifecycle:**

```
created → active → completed  (normal path)
                ↘ failed      (handler threw; retry scheduled if retries remain)
                             ↘ archived (retained for debugging)
```

**Diagnosis: check job state in the database**

```sql
-- Recent failed jobs across all queues
SELECT name, id, state, fail_count, data::text, output::text,
       started_on, completed_on
FROM pgboss.job
WHERE state = 'failed'
ORDER BY started_on DESC
LIMIT 20;
```

```sql
-- Jobs stuck in 'active' for more than 10 minutes (potential hung workers)
SELECT name, id, state, started_on, expire_in
FROM pgboss.job
WHERE state = 'active'
  AND started_on < NOW() - INTERVAL '10 minutes';
```

**Per-queue diagnostics:**

| Queue | Failure impact | Retry policy | Recovery action |
|---|---|---|---|
| `issue-certificate` | Certificate not issued after acceptance | 5 retries, exponential backoff | Check DB connectivity; certificate issue is idempotent — re-enqueue manually if needed |
| `send-reminders` | Reminder email not sent | Self-healing on next sweep (5 min) | No action needed unless job runner is down |
| `expire-offers` / `expire-sessions` | Status not updated in DB | Sweep-based; runs again next cron tick | No action needed unless job runner is down |
| `send-webhook` | Webhook delivery missed | 3 retries, exponential backoff | Check webhook endpoint; manually replay via pg-boss if needed |

**Re-enqueue a failed `issue-certificate` job manually:**

```sql
-- Find the failed job
SELECT id, data FROM pgboss.job
WHERE name = 'issue-certificate' AND state = 'failed'
ORDER BY started_on DESC LIMIT 5;

-- Re-send via the API (preferred) or re-insert via pg-boss INSERT
-- The handler is idempotent: running it again with the same acceptanceRecordId
-- either creates the certificate or returns the existing one.
```

**If the job worker does not restart after an API restart:**

1. Check for `[JobWorker] Error starting pg-boss` in logs — this usually means
   the `pgboss` schema is missing or the `DATABASE_URL` is wrong.
2. Confirm pg-boss schema exists: `SELECT * FROM pgboss.version;`
3. If the schema is missing, pg-boss will create it on the next startup.
   Ensure the database user has `CREATE SCHEMA` and `CREATE TABLE` privileges.

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

### Error monitoring setup (required before pilot)

The API emits structured JSON to stdout via NestJS Logger. To wire up alerting:

1. **Minimum (log-based alerting):**
   Route stdout to a log aggregator (Datadog, Logtail, CloudWatch Logs, etc.).
   Alert on:
   - Any log line containing `"level":"error"` from the API process.
   - HTTP 5xx response rate > 1% over a 5-minute window.
   - HTTP 429 rate > 10 per minute on `/signing/` paths.

2. **Error tracking (Sentry — configured in production):**
   Both the API (`apps/api/src/instrument.ts`) and the web frontend
   (`apps/web/sentry.*.config.ts`) are instrumented with Sentry.
   Set `SENTRY_DSN` (API) and `NEXT_PUBLIC_SENTRY_DSN` (web) in your
   environment. All unhandled exceptions and API errors are captured
   automatically with `requestId`, `endpoint`, and `organizationId` tags.

   **Alert baselines — configure these in the Sentry UI before launch:**

   | Alert name | Condition | Notify |
   |---|---|---|
   | Certificate generation failed | `certificate_generation_failed` event count > 1 in any 5-minute window | On-call |
   | Email delivery exhausted | `email_delivery_failed` event count > 10 in any 5-minute window | On-call |
   | OTP rate limit spike | `otp_rate_limit_exceeded` event count > 10 in any 5-minute window | On-call + security channel |
   | API error rate elevated | HTTP 5xx count > 5% of total requests over 5 minutes | On-call |
   | Unhandled exception | Any `level:fatal` event | Immediate page |

   To create these in Sentry: **Alerts → Create Alert → Metric Alert → Custom
   metric**. Select the project, set the metric to `event.count`, and add a
   filter on the event `message` or tag (e.g., tag `flow:signing` for OTP alerts).

   Minimum notification channel: email to `ops@offeraccept.com`.
   Recommended: PagerDuty or Slack `#incidents` for on-call alerts.

3. **Critical audit log alerting:**
   The `SupportAuditService` emits all support actions as structured JSON
   with `"type":"SUPPORT_AUDIT"`. Alert on any `REVOKE_OFFER`, `RESEND_OFFER_LINK`,
   or `RESEND_SESSION_OTP` action to give the team real-time visibility into
   support-initiated mutations.

4. **Background job monitoring:**
   Query `pgboss.job WHERE state = 'failed'` on a schedule (e.g., every 15 minutes)
   and alert if any row appears. pg-boss does not emit external events on failure —
   polling is the only mechanism unless you add a custom failure handler in `JobWorker`.

### GA requirements (not defined yet)

- Multi-region or availability-zone failover
- Certificate archival / long-term storage policy
- Automated compliance reporting

---

## 7. Certificate Snapshot Backfill Verification

After running migration `20260404_backfill_certificate_snapshotId`, verify that
all `AcceptanceCertificate` rows have a populated `snapshotId` before running
the hardening migration `20260405_certificate_snapshot_not_null`.

### Step 1 — Confirm no NULL rows remain

```sql
SELECT COUNT(*)
FROM acceptance_certificates
WHERE "snapshotId" IS NULL;
```

**Expected result:** `0`

If the count is non-zero, re-run the backfill UPDATE manually and investigate
whether any `AcceptanceRecord` rows are missing `snapshotId` (which would
indicate a data integrity problem pre-dating the hardening patch):

```sql
SELECT ac.id, ac."acceptanceRecordId"
FROM acceptance_certificates ac
JOIN acceptance_records ar ON ar.id = ac."acceptanceRecordId"
WHERE ar."snapshotId" IS NULL;
```

### Step 2 — Confirm FK integrity (no dangling references)

```sql
SELECT ac.id
FROM acceptance_certificates ac
LEFT JOIN offer_snapshots os ON os.id = ac."snapshotId"
WHERE ac."snapshotId" IS NOT NULL
  AND os.id IS NULL;
```

**Expected result:** `0 rows`

A non-zero result means a certificate references a snapshot that does not exist,
which is a critical integrity violation. Escalate immediately — do not run the
NOT NULL migration until this is resolved.

### Step 3 — Run the NOT NULL hardening migration

Only after both checks return zero:

```bash
npx prisma migrate deploy
```

This applies `20260405_certificate_snapshot_not_null`, which runs:

```sql
ALTER TABLE acceptance_certificates ALTER COLUMN "snapshotId" SET NOT NULL;
```

After the migration succeeds, update the Prisma schema field from:

```prisma
snapshotId String? @unique
```

to:

```prisma
snapshotId String  @unique
```

and generate a companion migration (`npx prisma migrate dev --name certificate_snapshot_notnull_schema`).
