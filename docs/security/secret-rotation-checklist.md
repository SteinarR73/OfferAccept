# Secret Rotation Checklist

**Trigger:** Potential exposure of secrets via committed `prisma/dev.db` or `.env` file  
**Severity:** P0 — rotate immediately upon confirmed or suspected exposure

> **Rule:** When in doubt, rotate. The cost of rotating a secret is low. The cost of not rotating an
> exposed secret is a breach.

---

## Before You Start

- [ ] Identify all secrets stored in the database (run `scripts/audit-dev-db.ts`)
- [ ] Identify all secrets in `.env` files across all environments (local, staging, production)
- [ ] Notify the team — some rotations (JWT_SECRET) will invalidate all active sessions
- [ ] Schedule a maintenance window if rotating DATABASE_URL in production
- [ ] Prepare rollback plan for each secret before rotating

---

## 1. JWT_SECRET

**What it protects:** Authentication. All access tokens and refresh tokens are signed with this key.  
**Impact of rotation:** All currently active user sessions are immediately invalidated. Every user will be logged out.

### Rotation steps

```bash
# 1. Generate a new strong secret (minimum 64 characters)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Or using openssl:
openssl rand -hex 64
```

- [ ] Generate new secret (64+ chars, cryptographically random)
- [ ] Update `JWT_SECRET` in your secrets manager / hosting environment
- [ ] Update `JWT_SECRET` in staging and any other environments
- [ ] Deploy the application (all existing tokens are now invalid)
- [ ] Verify new logins work with the updated secret
- [ ] If refresh tokens are stored in DB: `DELETE FROM "RefreshToken";` (old tokens are now invalid anyway)
- [ ] Remove old secret from all `.env` files and backups
- [ ] Document rotation date in your security log

**Verification:**
```bash
# A request with an old token should return 401
curl -H "Authorization: Bearer <old-token>" https://your-api.com/api/me
# Expected: { "error": "Unauthorized" }
```

---

## 2. STRIPE_SECRET_KEY

**What it protects:** Full access to your Stripe account — charges, refunds, customer data, subscriptions.  
**Impact of rotation:** Old key stops working immediately after rotation. Brief downtime if not deployed atomically.

### Rotation steps

- [ ] Log into [Stripe Dashboard](https://dashboard.stripe.com) → Developers → API keys
- [ ] Click "Roll key" on the secret key (generates a new key without deleting the old one)
- [ ] Copy the new secret key
- [ ] Update `STRIPE_SECRET_KEY` in your secrets manager / hosting environment
- [ ] Deploy the updated secret (Stripe allows a brief overlap period during this window)
- [ ] Verify Stripe operations work (create a test charge or check the balance endpoint)
- [ ] Return to Stripe Dashboard and delete the old key
- [ ] Update staging environment
- [ ] Document rotation date

**Verification:**
```bash
# Test with new key
curl https://api.stripe.com/v1/balance \
  -u "$NEW_STRIPE_SECRET_KEY:"
# Expected: 200 with balance data
```

---

## 3. STRIPE_WEBHOOK_SECRET

**What it protects:** Integrity of Stripe webhook events. Without this, anyone can forge payment events.  
**Impact of rotation:** Webhooks will fail (return 400) until the new secret is deployed.

### Rotation steps

- [ ] Log into Stripe Dashboard → Developers → Webhooks
- [ ] Find your webhook endpoint
- [ ] Click the endpoint → "Roll signing secret"
- [ ] Copy the new `whsec_...` value
- [ ] Update `STRIPE_WEBHOOK_SECRET` in your hosting environment
- [ ] Deploy immediately (webhook events will fail during this window — Stripe will retry)
- [ ] Verify the next webhook event is processed successfully (check Stripe dashboard → Webhooks → recent deliveries)
- [ ] Document rotation date

**Note:** Stripe retries failed webhook deliveries for up to 72 hours. Events delivered during
the rotation window will be retried and succeed once the new secret is deployed.

**Verification:**
```bash
# Send a test webhook from Stripe Dashboard → Webhooks → Send test event
# Check your logs for: "Webhook processed: checkout.session.completed"
```

---

## 4. GEMINI_API_KEY

**What it protects:** Access to Google Gemini AI API. Exposure = unauthorised charges to your Google Cloud account.  
**Impact of rotation:** All AI generation requests fail until new key is deployed. Brief downtime.

### Rotation steps

- [ ] Open [Google AI Studio](https://aistudio.google.com) → API keys (or Google Cloud Console → Credentials)
- [ ] Click "Create API key" to generate a new key
- [ ] Copy the new `AIza...` key
- [ ] Update `GEMINI_API_KEY` in your hosting environment
- [ ] Deploy
- [ ] Test a sample generation request
- [ ] Delete the old API key from Google AI Studio
- [ ] Check Google Cloud Console → Billing to verify no unexpected usage with the old key
- [ ] Document rotation date

**Verification:**
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$NEW_GEMINI_API_KEY"
# Expected: 200 with list of available models
```

---

## 5. DATABASE_URL

**What it protects:** Direct access to the production database — all user data, all business data.  
**Impact of rotation:** Application cannot connect to the database until redeployed. Requires maintenance window.

### Rotation steps (PostgreSQL)

```sql
-- Connect to the database as a superuser
-- Create a new password for the application user
ALTER USER your_app_user WITH PASSWORD 'new-strong-password-here';
```

- [ ] **Plan a maintenance window** — the app will be down between password change and redeployment
- [ ] Generate a new strong password: `openssl rand -base64 32`
- [ ] Change the database user password (SQL above or via hosting dashboard)
- [ ] Construct the new `DATABASE_URL`: `postgresql://user:new-password@host:5432/dbname`
- [ ] Update `DATABASE_URL` in your secrets manager / hosting environment
- [ ] Deploy immediately (app is down until this completes)
- [ ] Verify database connectivity: `prisma db pull` or a health check endpoint
- [ ] If using connection pooling (PgBouncer/Neon), update the password there too
- [ ] Document rotation date and maintenance window

**For managed providers:**

| Provider | Where to rotate |
|----------|----------------|
| Neon | Dashboard → Project → Settings → Reset password |
| Supabase | Dashboard → Project Settings → Database → Reset database password |
| Railway | Service → Variables → DATABASE_URL → Edit |
| RDS | AWS Console → Databases → Modify → New master password |

**Verification:**
```bash
# Test connectivity with new URL
DATABASE_URL="$NEW_DATABASE_URL" npx prisma db pull
# Expected: Prisma introspects schema without error
```

---

## 6. Additional Secrets Found in Database

If `scripts/audit-dev-db.ts` found additional secrets stored as user data or settings,
rotate those immediately. Common examples:

| What was found | How to rotate |
|---------------|---------------|
| OAuth client secrets | Provider dashboard → Credentials → Regenerate |
| Resend / SendGrid API keys | Email provider dashboard → API Keys → Create new, delete old |
| S3 / storage access keys | AWS IAM → Users → Security credentials → Rotate |
| Internal webhook shared secrets | Regenerate in both systems simultaneously |

---

## 7. Post-Rotation Verification Checklist

Run through these after completing all rotations:

- [ ] User login works end-to-end
- [ ] Stripe payment flow works (use test card in staging)
- [ ] Webhook receives and processes a test event
- [ ] AI generation completes successfully
- [ ] Database reads and writes work
- [ ] No 401/403/500 errors in logs related to auth or external services

---

## 8. Audit Trail

| Secret | Rotated | Rotated by | Old key fingerprint | Notes |
|--------|---------|------------|---------------------|-------|
| JWT_SECRET | | | | |
| STRIPE_SECRET_KEY | | | | |
| STRIPE_WEBHOOK_SECRET | | | | |
| GEMINI_API_KEY | | | | |
| DATABASE_URL | | | | |

*Fill in this table as each secret is rotated. Store in your secure documentation (not in this repo).*

---

*Part of the P0 security remediation for committed dev.db. See [dev-db-removal.md](./dev-db-removal.md).*
