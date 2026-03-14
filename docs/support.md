# OfferAccept v1 — Internal Support Tooling

This document describes the internal support API, authorization model, safe operational
actions, and what support staff can and cannot do.

---

## 1. Who Is This For?

OfferAccept support staff who need to investigate:

- A sender reporting that the recipient did not receive the offer link
- A recipient claiming they never accepted an offer
- A dispute where the evidence trail needs to be reviewed
- A stuck signing flow (recipient can't complete OTP)

Support staff do not need database access for any of these scenarios. The support API
provides everything needed to investigate and take limited safe actions.

---

## 2. Authorization

### Role model

| Role | Who holds it | Access |
|------|-------------|--------|
| `OWNER` | Customer org owner | Their org's offers only |
| `ADMIN` | Customer org admin | Their org's offers only |
| `MEMBER` | Customer org member | Their org's offers only |
| `INTERNAL_SUPPORT` | OfferAccept staff | All offers, cross-org (read + limited actions) |

`INTERNAL_SUPPORT` is assigned directly in the database by an OfferAccept operator. It
**must never** be self-assigned or assignable through any customer-facing flow.

### How authentication works

All support endpoints require a valid JWT with `role: INTERNAL_SUPPORT`. Requests without a
token receive `401 Unauthorized`. Requests with a valid token but the wrong role receive
`403 Forbidden`.

Support users still have a `userId` (`sub` in the JWT) and an `orgId` in their token, but
the support API does **not** filter by `orgId`. This is intentional: support staff may need
to inspect offers from any customer organization.

### How to create a support user

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

The `organization_id` should point to an internal OfferAccept organization (not a customer
org). The `INTERNAL_SUPPORT` role gates access — the org membership is only for the FK
constraint.

---

## 3. Support API Endpoints

Base path: `/support` (requires `role: INTERNAL_SUPPORT` on all routes)

### Read-only endpoints

#### Search offers

```
GET /support/offers?offerId=<id>
GET /support/offers?recipientEmail=<email>
```

Find an offer by its ID or by the recipient's email address. Returns up to 20 results for
email searches, newest first. Returns an empty array (not 404) when nothing matches.

**Response shape:**
```json
[
  {
    "offerId": "clx...",
    "offerTitle": "Consulting Agreement",
    "status": "SENT",
    "recipientEmail": "alice@client.com",
    "createdAt": "2024-01-01T09:00:00.000Z"
  }
]
```

---

#### Full case view

```
GET /support/offers/:offerId/case
```

Returns everything known about an offer in one response:

- **offer** — current status, expiry, creation date
- **snapshot** — frozen content (title, sender identity, document count, content hash)
- **recipient** — email, status, viewed/responded timestamps, token state
- **deliveryAttempts** — email delivery history (newest first)
- **sessions** — all signing sessions with event counts
- **acceptanceRecord** — if accepted: statement, verified email, IP, locale, timezone
- **certificate** — if generated: ID, issuedAt, and live verification result

The certificate verification is run on every `GET /case` request so the result is always
current (not cached).

**Note:** `snapshot.contentHash` and `certificate.verification` together allow a reviewer
to confirm that the certificate was derived from the same content the recipient saw.

---

#### Dispute timeline

```
GET /support/offers/:offerId/timeline
```

Returns a chronological, human-readable sequence of events. Each entry has:

```json
{
  "timestamp": "2024-01-02T10:01:00.000Z",
  "event": "OTP code sent to recipient",
  "actor": "system",
  "detail": "Sent to: al****@client.com"
}
```

**Actor values:**
- `system` — automated action (delivery, session expiry, certificate issuance)
- `sender` — action taken by the sending organization
- `recipient` — action taken by the recipient
- `support` — action triggered by OfferAccept staff (resend via support API)

**Event sequence (typical accepted offer):**

| Event | Actor |
|-------|-------|
| Offer sent | sender |
| Offer link email accepted by provider | system |
| Recipient opened signing link (session started) | recipient |
| OTP code sent to recipient | system |
| Incorrect OTP code submitted | recipient |
| OTP verified — email ownership confirmed | recipient |
| Document viewed | recipient |
| Offer accepted | recipient |
| Acceptance certificate issued | system |

OTP delivery address is masked in the timeline detail (`al****@client.com`). Raw email
addresses are visible in the `recipient` section of the case view.

---

#### Session events (raw)

```
GET /support/sessions/:sessionId/events
```

Returns the raw `SigningEvent` rows for a session in sequence order, with `sequenceNumber`,
`eventType`, `timestamp`, `payload`, and `ipAddress`. Use this for deep inspection when the
timeline summary is not sufficient.

---

### Safe action endpoints

These endpoints trigger state changes. All actions are logged and auditable.

#### Revoke offer

```
POST /support/offers/:offerId/revoke
```

Revokes a `SENT` offer. The recipient's signing token is invalidated. The offer transitions
to `REVOKED`. The sender is not notified automatically — support should communicate this to
the sender directly.

**When to use:** The sender requests revocation and cannot do it themselves (e.g., locked
out of their account), or the offer must be revoked for compliance reasons.

**Domain rules enforced:**
- Only `SENT` offers can be revoked. Returns `409` for ACCEPTED, DECLINED, REVOKED, EXPIRED.
- Signing events, acceptance records, snapshots, and certificates are **not touched**.

---

#### Resend offer link

```
POST /support/offers/:offerId/resend-link
```

Re-sends the offer link to the recipient with a **new signing token**. The old link is
superseded. Email content is sourced from the frozen `OfferSnapshot` (no content mutation).

Returns:
```json
{
  "offerId": "clx...",
  "deliveryAttemptId": "clx...",
  "deliveryOutcome": "DELIVERED_TO_PROVIDER"
}
```

A new `OfferDeliveryAttempt` is created with `attemptedBy` = the support agent's user ID.
This appears in the delivery attempt history and in the timeline (actor: `support`).

**Domain rules enforced:**
- Only `SENT` offers with a non-invalidated token can be resent. Returns `409` otherwise.
- Offer snapshot is **never mutated**.

**When to use:** Sender reports that the recipient never received the link. Check the delivery
history first (`GET /case`). If the latest attempt is `FAILED`, use this to retry.

---

#### Resend OTP

```
POST /support/sessions/:sessionId/resend-otp
```

Issues a new OTP challenge to an active signing session and sends it to the recipient's
email. Returns the masked delivery address and expiry.

```json
{
  "sessionId": "clx...",
  "deliveryAddressMasked": "al****@client.com",
  "expiresAt": "2024-01-02T10:30:00.000Z"
}
```

The raw OTP code is **never** returned or logged.

**Domain rules enforced:**
- Session must be in `AWAITING_OTP` status. Returns `409` for `OTP_VERIFIED` or any terminal
  status — there is no reason to re-send OTP to a completed session.
- Session must not be expired. Returns `422` if the session TTL has passed.
- A new `OTP_ISSUED` signing event is appended to the session's event chain.

**When to use:** Recipient reports they did not receive the OTP code. First check the
timeline for `OTP_ISSUED` events to confirm the code was sent. Then use this action to
issue a fresh code. The old code is automatically invalidated.

---

## 4. What Support CAN Do

| Action | Endpoint | Condition |
|--------|----------|-----------|
| Search offers | `GET /support/offers?...` | Always |
| View full case | `GET /support/offers/:id/case` | Always |
| View dispute timeline | `GET /support/offers/:id/timeline` | Always |
| View raw signing events | `GET /support/sessions/:id/events` | Always |
| Verify certificate integrity | (included in case view) | Always |
| Revoke offer | `POST /support/offers/:id/revoke` | Offer is SENT |
| Resend offer link | `POST /support/offers/:id/resend-link` | Offer is SENT, token not invalidated |
| Resend OTP | `POST /support/sessions/:id/resend-otp` | Session is AWAITING_OTP and not expired |

---

## 5. What Support CANNOT Do

Support tooling is explicitly designed to prevent the following:

| Action | Why not allowed |
|--------|----------------|
| Edit offer content | OfferSnapshot is immutable — content was frozen at send time |
| Edit or delete signing events | SigningEvent is append-only — events form a hash chain |
| Delete or modify acceptance records | AcceptanceRecord is immutable evidence |
| Delete or regenerate certificates | AcceptanceCertificate derives from immutable evidence |
| Approve or force-accept an offer | Acceptance requires recipient OTP verification |
| Change recipient email address | Would break the email-control proof |
| Access raw OTP codes | Raw codes are never stored or returned by any endpoint |
| Access raw signing tokens | Raw tokens are never stored or returned by any endpoint |
| View users' hashed passwords | Not exposed by any API |

---

## 6. Typical Dispute Workflow

### Scenario A: Recipient claims they never accepted

1. `GET /support/offers?recipientEmail=<email>` — find the offer
2. `GET /support/offers/:id/case` — check `offer.status` and `acceptanceRecord`
3. `GET /support/offers/:id/timeline` — review the event sequence:
   - Was `SESSION_STARTED` recorded? (did they open the link?)
   - Was `OTP_VERIFIED` recorded? (did they confirm their email?)
   - Was `OFFER_ACCEPTED` recorded?
4. `GET /support/sessions/:id/events` — inspect IP addresses if needed
5. `GET /support/offers/:id/case` → `certificate.verification` — confirm cert is valid

If `OFFER_ACCEPTED` is in the chain and the certificate hash matches, the acceptance is
fully evidenced. The `acceptanceStatement` in the case view contains the verbatim text
shown to the recipient.

---

### Scenario B: Recipient never received the offer link

1. `GET /support/offers?recipientEmail=<email>` — find the offer
2. `GET /support/offers/:id/case` → `deliveryAttempts` — check `outcome`:
   - `DELIVERED_TO_PROVIDER`: email was accepted by provider; check spam/junk
   - `FAILED`: delivery failed — resend via support action
3. If `FAILED`: `POST /support/offers/:id/resend-link`
4. Confirm the new attempt is `DELIVERED_TO_PROVIDER` in the delivery history

---

### Scenario C: Recipient received the link but can't complete OTP

1. `GET /support/offers/:id/timeline` — check for `OTP_ISSUED` events
2. Check if session is expired (`GET /support/offers/:id/case` → `sessions`)
3. If session exists and is `AWAITING_OTP`: `POST /support/sessions/:id/resend-otp`
4. If session is expired: use `POST /support/offers/:id/resend-link` to issue a new link
   (this generates a new token; recipient opens the new link to start a fresh session)

---

## 7. Audit Trail for Support Actions

All support actions that modify state are tracked:

- **Revoke**: `OfferRecipient.tokenInvalidatedAt` is set; `Offer.status` = REVOKED
- **Resend link**: A new `OfferDeliveryAttempt` is created with `attemptedBy` = support user ID; timeline shows actor as `support`
- **Resend OTP**: A new `OTP_ISSUED` signing event is appended to the session's event chain

This means the timeline will accurately reflect any support intervention during a dispute
investigation.
