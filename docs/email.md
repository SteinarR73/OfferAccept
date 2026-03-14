# OfferAccept v1 — Email Configuration and Deliverability

This document covers everything that must be configured before OfferAccept sends real email
in production. Missing any of these will cause email to land in spam, be rejected by
recipient MTAs, or fail to send entirely.

---

## 1. Email Provider

OfferAccept uses a provider-agnostic `EmailPort` abstraction. The active adapter is
selected at startup via the `EMAIL_PROVIDER` environment variable.

| `EMAIL_PROVIDER` | Adapter | When to use |
|-----------------|---------|-------------|
| `dev` (default) | `DevEmailAdapter` | Local development, automated tests. Never sends real email. |
| `resend` | `ResendEmailAdapter` | Production and staging environments. |

### Required environment variables (production)

```bash
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...          # from Resend dashboard → API Keys
EMAIL_FROM=noreply@yourdomain.com  # must be a verified domain in Resend
```

The app will **refuse to start** if `EMAIL_PROVIDER=resend` and `RESEND_API_KEY` is missing.

---

## 2. DNS: SPF, DKIM, DMARC

These three DNS records are the minimum for reliable delivery. Without them, email from
your domain will be rejected or silently discarded by most major providers.

### SPF (Sender Policy Framework)

SPF declares which servers are authorised to send email on behalf of your domain. If you
send via Resend, Resend publishes an SPF record you include:

```
Type:  TXT
Name:  @  (or yourdomain.com)
Value: v=spf1 include:amazonses.com ~all
```

*(Resend uses Amazon SES under the hood. Confirm current guidance at resend.com/docs/send-with-resend.)*

If you also send from other sources (e.g., Google Workspace for internal email), include
them: `v=spf1 include:_spf.google.com include:amazonses.com ~all`

**Common mistake:** multiple SPF TXT records on the same name. There must be exactly one
SPF TXT record per domain name.

### DKIM (DomainKeys Identified Mail)

DKIM cryptographically signs outbound messages so recipients can verify they were not
tampered with in transit. Resend provides the DKIM keys when you add a domain.

In your DNS:
```
Type:  TXT (CNAME for Resend)
Name:  resend._domainkey.yourdomain.com
Value: (provided by Resend — a CNAME pointing to Resend's DKIM signer)
```

After adding the DKIM CNAME, verify it in the Resend dashboard. Resend will not send on
behalf of your domain until verification passes.

### DMARC (Domain-based Message Authentication, Reporting and Conformance)

DMARC tells receiving MTAs what to do when SPF or DKIM checks fail, and where to send
reports. Start with `p=none` (monitor-only), then graduate to `p=quarantine` once you are
confident in your setup.

```
Type:  TXT
Name:  _dmarc.yourdomain.com
Value: v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.com
```

Once deliverability is confirmed (1–2 weeks of monitoring):
```
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@yourdomain.com
```

Never start with `p=reject` unless you are certain all legitimate outbound email passes
SPF+DKIM alignment.

---

## 3. Sender Domain Guidance

### Use a subdomain for transactional email

Send from `mail.yourdomain.com` or `noreply.yourdomain.com` rather than the root domain.
This isolates your transactional sending reputation from your marketing/newsletter domain
and your root domain (used for web traffic):

```
EMAIL_FROM=noreply@mail.yourdomain.com
```

### Never send from a free email provider

`EMAIL_FROM=noreply@gmail.com` or `@outlook.com` will be rejected. You must own the
sending domain and configure SPF/DKIM for it.

### Avoid "no-reply" as the display name

Many users try to reply to transactional emails. A `no-reply` address is fine, but the
Resend adapter sets the from name to `OfferAccept`, which is clear about the sender without
being dismissive.

---

## 4. Email Content: Phishing-Resistant OTP Wording

The OTP email includes an anti-phishing statement:

> **OfferAccept will never ask you to share this code by email, phone, or chat.**

This wording is mandated by several industry anti-phishing guidelines and is hardcoded into
the OTP template (`templates/index.ts`). Do not remove it.

Other requirements for the OTP email:
- Subject line must contain the offer title to provide context (so the recipient knows why
  they're receiving a code)
- The code must be displayed prominently and not buried in a paragraph
- The code must not appear in log output (enforced in `ResendEmailAdapter`)
- The expiry time must be stated clearly

---

## 5. Email Use Cases and Delivery Criticality

| Email type | Trigger | Criticality | Failure handling |
|------------|---------|-------------|-----------------|
| OTP verification | `POST /signing/:token/otp` | **High** — recipient cannot proceed without it | Logged error; recipient can re-request OTP (new code, old invalidated) |
| Offer link | `POST /offers/:id/send` | **High** — recipient cannot sign without it | Offer is marked SENT in DB; email failure logged; sender must resend manually (v1 limitation) |
| Acceptance → sender | On acceptance | Medium | Best-effort; swallowed with error log |
| Acceptance → recipient | On acceptance | Medium | Best-effort; swallowed with error log |
| Decline → sender | On decline | Low | Best-effort; swallowed with error log |

"Best-effort" means the email failure never reverses the DB state. The acceptance record
and certificate exist regardless of whether the notification email was delivered.

---

## 6. Retry Strategy

### OTP and offer link emails

These are sent synchronously after the relevant DB transaction commits. If they fail:

- **OTP:** The OTP challenge exists in the DB. The recipient can request a new OTP, which
  invalidates the old one. The failure is logged at ERROR level with the recipient email
  address and offer title (not the code or token).

- **Offer link:** The offer is SENT in the DB but the recipient did not receive the link.
  In v1, the sender must notice the failure in logs and resend (future: retry queue or
  manual resend endpoint).

### Notification emails (acceptance, decline)

These are best-effort. No retry is attempted. If they fail, an ERROR log is written.

### Provider-level retries (Resend)

Resend handles provider-level retries internally for transient failures (5xx, network
issues). Do not implement application-level retries for 5xx on top of this, as it risks
duplicate delivery.

**Do retry (at application level) for:**
- Network timeout before response received (safe: Resend is idempotent within a short
  window via idempotency keys, which the `ResendEmailAdapter` does not currently implement;
  add this before enabling application retries)

**Do not retry for:**
- 422 Unprocessable Entity (invalid from address, domain not verified) — fix config first
- 403 Forbidden (invalid API key) — fix API key first
- 400 Bad Request — fix the request payload

---

## 7. Idempotency

The current `ResendEmailAdapter` does not send idempotency keys. This means if an OTP
email is sent and the response is lost (network timeout), a retry would send the same code
in a second email. This is acceptable in v1 because:

1. The recipient gets two emails with the same code — both are valid
2. The recipient requests a new OTP → both codes are invalidated and a new one is issued

Before implementing application-level retries, add `Idempotency-Key` headers to the Resend
API calls using a deterministic key (e.g., SHA-256 of `challengeId + attempt`).

---

## 8. Pre-Production Checklist

Before directing real customer traffic to the production deployment:

- [ ] `EMAIL_PROVIDER=resend` is set in the production environment
- [ ] `RESEND_API_KEY` is set and corresponds to the production Resend account
- [ ] `EMAIL_FROM` is set to an address on your verified sending domain
- [ ] SPF record is published and passes `dig TXT yourdomain.com`
- [ ] DKIM CNAME is set and verified in the Resend dashboard
- [ ] DMARC record is published (start with `p=none`)
- [ ] Test emails have been sent and received (check spam folder)
- [ ] DMARC reports are being collected and show 100% aligned traffic
- [ ] The `WEB_BASE_URL` env var points to the correct production URL (signing links use it)
- [ ] Resend domain reputation warm-up is planned if sending volume > 1,000/day initially

---

## 9. Local Development

With the default `EMAIL_PROVIDER=dev`, no email is sent. The `DevEmailAdapter`:

- Prints the OTP code and signing URL to the console (stdout)
- Stores sent items in memory for test retrieval (`getLastCode()`, `getLastOfferLink()`, etc.)
- Is always available in the NestJS DI container even when Resend is active (for test use)

To inspect emails during development, tail the API server logs.
