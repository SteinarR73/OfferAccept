# Secret Rotation Execution Plan
**Severity:** P0 — Execute immediately upon confirmed or suspected exposure  
**Maintained by:** Engineering lead  
**Last updated:** 2026-04-11

> **Rule:** When in doubt, rotate. The cost of rotating a secret is low. The cost
> of an exposed secret is a breach.

---

## Quick Reference

| Secret | Location | Impact of Rotation | Downtime? |
|--------|----------|--------------------|-----------|
| `JWT_SECRET` | Secrets manager / `.env` | All sessions invalidated | None (users re-login) |
| `STRIPE_SECRET_KEY` | Stripe dashboard + secrets manager | Billing API calls break until deployed | ~2 min deploy |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard + secrets manager | Webhooks fail until redeployed | ~2 min deploy |
| `GEMINI_API_KEY` | Secrets manager | AI features degraded until redeployed | ~2 min deploy |
| `DATABASE_URL` | Secrets manager | All API calls fail until redeployed | Needs maintenance window |

---

## 1. JWT_SECRET

**What it protects:** All access tokens and refresh tokens are signed with this key.
Anyone with the old key can forge valid tokens until rotation is deployed.

**Where it is configured:**
- Production: secrets manager (AWS Secrets Manager / Doppler / Vault)
- Local dev: `apps/api/.env`
- CI: environment variable in CI secrets store

**Rotation steps:**
```bash
# 1. Generate a new secret (minimum 64 hex characters = 256 bits)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 2. Update the secret in your secrets manager
#    (Replace the existing JWT_SECRET value — do NOT create a parallel key)

# 3. Deploy the new value to all API pods
#    Rolling restart is sufficient — the new key takes effect immediately

# 4. Confirm the old key is not retained anywhere
grep -r "JWT_SECRET" --include="*.env" --include="*.env.*" .
```

**Verification procedure:**
```bash
# 1. Log in to the application — should succeed (new token issued with new key)
# 2. The session from step 1 should work
# 3. Confirm any token signed with the OLD key is rejected:
curl -H "Authorization: Bearer <old_token>" https://api.yourdomain.com/api/v1/auth/me
# Expected: 401 Unauthorized
```

**Impact:** All existing sessions are immediately invalidated. Every logged-in user
is logged out. No data loss. Users can immediately log in again.

**Rollback guidance:** Re-deploy with the old `JWT_SECRET` value. Sessions issued
after the rotation and before rollback will be invalidated. Rollback should only be
used to recover from a deployment failure, not to "undo" a security rotation.

---

## 2. STRIPE_SECRET_KEY

**What it protects:** All Stripe API operations: charges, subscriptions, customer
creation, and webhook validation.

**Where it is configured:**
- Stripe dashboard: https://dashboard.stripe.com/apikeys
- Production: secrets manager
- Local dev: `apps/api/.env`

**Rotation steps:**
```bash
# 1. In the Stripe Dashboard, create a NEW restricted/secret key
#    (Do NOT delete the old key until the new one is deployed and verified)

# 2. Update the secret in your secrets manager with the new key

# 3. Deploy the new value — verify Stripe operations work before proceeding

# 4. Delete the OLD key from the Stripe dashboard
#    (Only after confirming the new key is working in production)
```

**Verification procedure:**
```bash
# 1. Create a test checkout session via the API and confirm it succeeds
curl -X POST https://api.yourdomain.com/api/v1/billing/checkout \
  -H "Authorization: Bearer <valid_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"planId": "starter"}'
# Expected: 200 with checkoutUrl

# 2. Check Stripe dashboard for the successful API call under "Logs"
```

**Rollback guidance:** Re-deploy with the old key. The old key remains valid until
explicitly deleted in the Stripe dashboard — this is the safe rollback window.

---

## 3. STRIPE_WEBHOOK_SECRET

**What it protects:** HMAC signature verification on incoming Stripe webhook events.
An attacker with the old secret can forge webhook events (fake payments).

**Where it is configured:**
- Stripe dashboard: Webhooks section, per-endpoint signing secret
- Production: secrets manager
- Local dev: `apps/api/.env`

**Rotation steps:**
```bash
# 1. In the Stripe Dashboard → Developers → Webhooks → your endpoint
#    Click "Roll signing secret" — Stripe generates a new secret

# 2. During a brief transition window, Stripe sends webhooks signed with BOTH the
#    old and new secret. Deploy the new STRIPE_WEBHOOK_SECRET before the old one expires.

# 3. Update secrets manager and deploy

# 4. Stripe will retire the old secret after 72 hours automatically
```

**Verification procedure:**
```bash
# 1. Use the Stripe CLI to send a test event:
stripe trigger payment_intent.succeeded
# Check API logs — webhook should be processed (no 400 signature error)

# 2. Alternatively, check the Stripe dashboard webhook logs for successful deliveries
```

**Rollback guidance:** Stripe maintains both the old and new secret during the 72-hour
transition window. Revert the deployment and the old secret is still valid.

---

## 4. GEMINI_API_KEY

**What it protects:** Access to Google Gemini AI API. An exposed key incurs cost on
your GCP billing account and can be used to exfiltrate data sent in prompts.

**Where it is configured:**
- Google AI Studio / GCP: https://aistudio.google.com/app/apikey
- Production: secrets manager
- Local dev: `apps/api/.env`

**Note:** The current OfferAccept codebase (as of 2026-04-11) does **not** use Gemini
directly. If Gemini is added in future, configure the key here and in env.ts validation.

**Rotation steps:**
```bash
# 1. In Google AI Studio, create a new API key
# 2. Update the secret in your secrets manager
# 3. Deploy and verify AI features work
# 4. Delete the old key in Google AI Studio

# Optional: set per-key quotas in GCP to limit blast radius
```

**Verification procedure:**
```bash
# Test with a minimal API call (does not consume significant quota):
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_NEW_KEY"
# Expected: 200 with model list
```

**Rollback guidance:** Create the old key value as a new key in AI Studio (if you
saved it). Otherwise deploy a temporary service degradation until new key is available.

---

## 5. DATABASE_URL

**What it protects:** Direct access to the production PostgreSQL database.
Exposure allows an attacker to read or destroy all data.

**Where it is configured:**
- Hosting provider (Railway / Neon / RDS): connection string in dashboard
- Production: secrets manager
- Local dev: `packages/database/.env`

**⚠️ This rotation requires a maintenance window.**

**Rotation steps:**
```bash
# Option A: Rotate the database password (preserves same host/database)
# 1. Connect to PostgreSQL as a superuser:
psql $DATABASE_URL -c "ALTER USER offeraccept_user PASSWORD 'NEW_STRONG_PASSWORD';"

# 2. Update DATABASE_URL in your secrets manager with the new password
# 3. Deploy immediately — there is a brief window where the old password is invalid
#    Schedule this during low-traffic hours

# Option B: Migrate to a new database instance
# Use this if the host credentials (host/port/dbname) were also exposed.
# Follow docs/database/postgres-migration.md for the full procedure.
```

**Verification procedure:**
```bash
# 1. After deploying, check API health endpoint:
curl https://api.yourdomain.com/api/v1/health/z
# Expected: { "status": "ok" }

# 2. Test a database-backed operation (e.g., login):
curl -X POST https://api.yourdomain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"..."}' 
```

**Rollback guidance:** Revert the password change immediately using the superuser
account. Then redeploy the old DATABASE_URL value. This window must be kept short —
ideally under 5 minutes.

---

## Rotation Log

| Date | Secret | Rotated By | Trigger | Notes |
|------|--------|-----------|---------|-------|
| _YYYY-MM-DD_ | — | — | — | (fill in as rotations occur) |

---

## After Rotation

- [ ] Confirm all production pods are running with the new secret (check health endpoints)
- [ ] Confirm old secret is invalidated / deleted at the source
- [ ] Update the rotation log above
- [ ] Run `scripts/verify-secrets.ts` in staging to confirm all vars are present
- [ ] Notify the security team that rotation is complete
- [ ] Update the next rotation schedule (recommended: every 90 days for API keys)
