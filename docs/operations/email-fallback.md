# Email Fallback Plan

Operational runbook for email delivery failures in production.

---

## Architecture overview

OfferAccept uses a provider-agnostic `EmailPort` interface
(`apps/api/src/common/email/email.port.ts`). The active adapter is selected at
startup via `EMAIL_PROVIDER`:

| `EMAIL_PROVIDER` | Adapter | Used when |
|---|---|---|
| `resend` | `ResendEmailAdapter` | Production / staging |
| `dev` | `DevEmailAdapter` | Local dev and CI tests |

All email dispatch is **job-based** — the API enqueues a pg-boss job which the
worker executes. Failed jobs are retried automatically (pg-boss default: 3
attempts with exponential backoff). This means transient Resend errors are
self-healing without operator intervention.

---

## Failure scenarios and responses

### 1. Transient Resend API error (HTTP 5xx / timeout)

**Symptoms:** pg-boss job fails and retries; delivery delayed by minutes.

**Response:** No immediate action required. pg-boss retries up to 3 times.
Monitor the `email_delivery_failed` metric in your observability dashboard.
If retries are exhausted, the job moves to the `failed` state and must be
manually re-queued (see §4).

---

### 2. Resend API key revoked or quota exceeded

**Symptoms:** All email jobs fail with `401 Unauthorized` or `429 Too Many Requests`.
`/api/v1/health/services` shows `emailDelivery: degraded` (once the DB-based
metric integration is wired — currently the endpoint reports `operational` unless
the database itself is down).

**Response:**

1. **Rotate the key** (if revoked): generate a new API key in the Resend
   dashboard and update the `RESEND_API_KEY` secret in your deployment
   environment. Restart the API container — the adapter is constructed at startup.

2. **Upgrade quota** (if rate-limited): contact Resend support or upgrade plan.

3. **Re-queue failed jobs** once the key/quota issue is resolved (see §4).

---

### 3. Resend domain or sender suspended

**Symptoms:** Resend returns `422 Unprocessable Entity` with a domain-level error.

**Response:**

1. Contact Resend support to resolve the domain suspension.
2. If resolution takes >2 hours, switch to the fallback provider (see §5).

---

### 4. Re-queuing failed email jobs

pg-boss stores failed jobs in the `pgboss.job` table with `state = 'failed'`.

```sql
-- Inspect failed email jobs
SELECT id, name, data, createdon, completedon, output
FROM pgboss.job
WHERE state = 'failed'
  AND name LIKE 'email.%'
ORDER BY createdon DESC
LIMIT 50;

-- Re-queue a specific failed job (replace <job_id>)
UPDATE pgboss.job
SET state = 'created',
    startafter = NOW(),
    retrycount = 0
WHERE id = '<job_id>';
```

Only re-queue jobs whose underlying cause (key revoked, domain suspended) has
been resolved. Retrying jobs while the cause is still active wastes retry budget.

---

### 5. Emergency provider switch

The `EmailPort` interface makes adding a secondary adapter straightforward.
If Resend is unavailable for more than a few hours and you need to switch
providers (e.g. SendGrid, Postmark):

1. Implement a new adapter in `apps/api/src/common/email/` that satisfies the
   `EmailPort` interface (all 7 methods).
2. Register it in `email.module.ts` under a new `EMAIL_PROVIDER` value
   (e.g. `sendgrid`).
3. Update `EMAIL_PROVIDER` and add the new provider's API key in the deployment
   environment, then redeploy.
4. DNS: ensure the new provider's SPF/DKIM records are added to your domain
   before switching. Sending from an unverified domain will result in spam or
   rejection.

**No schema changes or job-queue changes are needed** — all email jobs carry the
rendered payload (recipient, subject, body) and are adapter-agnostic.

---

### 6. Critical path emails

The following email types are on the deal signing critical path. Failure to
deliver these directly blocks a deal from progressing:

| Email | Sent by | Blocking? |
|---|---|---|
| OTP verification code | `sendOtp` | **Yes** — recipient cannot sign without it |
| Offer link | `sendOfferLink` | **Yes** — recipient cannot access the deal |
| Acceptance confirmation (sender) | `sendAcceptanceConfirmationToSender` | No — informational |
| Acceptance confirmation (recipient) | `sendAcceptanceConfirmationToRecipient` | No — informational |
| Decline notification | `sendDeclineNotification` | No — informational |

For OTP and offer-link failures, the sender can manually resend from the
dashboard (`/dashboard/deals/[id]` → Resend button). The acceptance record is
already persisted — re-sending is purely informational.

---

## Monitoring recommendations

- Alert on `pgboss.job` rows with `state = 'failed' AND name LIKE 'email.%'`
  accumulating faster than 1 per 5 minutes.
- Alert on Resend webhook events for `email.bounced` or `email.complained` above
  a 1% threshold per sending domain.
- The `/api/v1/health/services` endpoint currently derives `emailDelivery` status
  from database availability. A future improvement would track the rolling failure
  rate of `email.*` pg-boss jobs and surface it here.
