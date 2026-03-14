# OfferAccept v1 — Sender Dispatch and Delivery Model

This document describes how OfferAccept tracks the delivery of the sender→recipient offer
link email, what the delivery states mean, how resend works, and the operational limits of
v1 delivery visibility.

---

## 1. The Delivery Problem

When a sender sends an offer, two things happen:

1. **Snapshot creation** — the offer content is frozen atomically in the database
2. **Email dispatch** — the offer link is sent to the recipient via the email provider

These two steps have different failure modes. The snapshot creation is transactional and
either succeeds completely or rolls back. The email dispatch is a network call to a third-party
provider and may fail even after the snapshot is safely committed.

In early v1, the offer became `SENT` in the database regardless of whether the email was
actually handed off to the provider. This meant the sender had no visibility into whether
the recipient ever received the link.

The delivery model described here fixes this gap.

---

## 2. The Delivery State Model

### Where state is stored

Delivery state lives in `OfferDeliveryAttempt`, a separate entity from `Offer` and
`OfferRecipient`. This separation is intentional:

- **`Offer`** tracks business lifecycle state (`DRAFT`, `SENT`, `ACCEPTED`, etc.)
- **`OfferRecipient`** owns the cryptographic token that secures the signing link
- **`OfferDeliveryAttempt`** tracks provider handoff outcome for each send/resend action

A new row is created for every send and resend. History is preserved — the latest row is
authoritative for current delivery state, but all prior attempts remain queryable.

### Outcome states

| Outcome | Meaning |
|---------|---------|
| `DISPATCHING` | Email call initiated; never persisted in this state for more than milliseconds |
| `DELIVERED_TO_PROVIDER` | Email provider returned HTTP 2xx; message accepted for delivery |
| `FAILED` | Email provider returned a non-2xx status, or a network error occurred |

`DELIVERED_TO_PROVIDER` means the provider (Resend) accepted the message. It does **not**
mean the recipient's inbox received it — final delivery is outside OfferAccept's control
and depends on recipient MTA, spam filters, and DNS configuration.

### What `FAILED` means

A `FAILED` outcome means one of:

- The provider rejected the message (e.g., 422: domain not verified, 403: invalid API key)
- A network timeout occurred before a response was received

The `failureCode` field contains the HTTP status from the provider (null for network errors).
The `failureReason` field contains the provider error message or the runtime error message.

### Relationship to `Offer.status`

`Offer.status` becomes `SENT` as part of the atomic transaction, which commits before any
email call is made. `Offer.status = SENT` therefore means:

> The offer snapshot is frozen, the signing token is live, and the recipient can sign if
> they have the link.

It does **not** mean the email was delivered. Use `OfferDeliveryAttempt.outcome` to determine
whether the email was handed off to the provider.

---

## 3. Send Flow (Initial Dispatch)

```
POST /offers/:id/send
│
├── Load offer + assert DRAFT
├── Generate signing token (rawToken — never persisted)
├── Compute snapshot content hash
│
├── $transaction ─────────────────────────────────────────────────────────┐
│   ├── Create OfferSnapshot (frozen content)                             │
│   ├── Create OfferSnapshotDocuments                                     │
│   ├── Update OfferRecipient (real tokenHash replaces draft placeholder) │
│   └── Update Offer.status → SENT                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────── commit ──┘
│
├── Create OfferDeliveryAttempt (outcome: DISPATCHING)
│
├── Call emailPort.sendOfferLink()
│   ├── SUCCESS → Update attempt → DELIVERED_TO_PROVIDER
│   └── FAILURE → Update attempt → FAILED (failureCode, failureReason logged)
│
└── Return { snapshotId, sentAt, deliveryAttemptId, deliveryOutcome }
```

The offer remains `SENT` regardless of email outcome. This is intentional — the snapshot
and token are valid. The sender can use resend to retry delivery.

---

## 4. Resend

### What resend does

`POST /offers/:id/resend` re-delivers the offer link with a **new signing token**.

Steps:
1. Assert offer is `SENT` and recipient token is not invalidated
2. Generate a new `rawToken` + `tokenHash`
3. Update `OfferRecipient.tokenHash` to the new hash (old link can no longer start new sessions)
4. Load the `OfferSnapshot` for frozen email content
5. Create `OfferDeliveryAttempt` (outcome: `DISPATCHING`, `attemptedBy`: sender user ID)
6. Call `emailPort.sendOfferLink()` with snapshot content
7. Update attempt to `DELIVERED_TO_PROVIDER` or `FAILED`

### Domain rules

| Condition | Result |
|-----------|--------|
| Offer status is not `SENT` | `409 Conflict` |
| Recipient token is invalidated (offer was revoked) | `409 Conflict` |
| Offer not found or not in org | `404 Not Found` |

### Why a new token?

The `rawToken` is never stored (only its SHA-256 hash is persisted). There is no way to
recover the original URL to resend it. Generating a new token is the only option.

As a side effect, the old link becomes invalid for initiating new signing sessions once
the new token replaces the hash in `OfferRecipient`. Existing open signing sessions are
unaffected — they are bound to the `snapshotId`, not the token.

### What resend does NOT do

- **No snapshot mutation.** The `OfferSnapshot` is never written to. Email content is
  sourced from the existing snapshot to guarantee the recipient sees the same offer content.
- **No business state duplication.** No new `Offer`, `OfferRecipient`, or `OfferSnapshot`
  is created. Only `OfferRecipient.tokenHash` is updated and a new `OfferDeliveryAttempt` is
  appended.
- **No status change.** The offer stays `SENT` regardless of resend outcome.

### Email failure during resend

If the email provider call fails, the attempt is recorded as `FAILED` and the failure is
logged. The new token remains active on `OfferRecipient` — if the sender retries resend
again, a third token will be generated. This ensures there is always a live token the
sender can trigger a delivery for.

---

## 5. Delivery History

`GET /offers/:id/delivery` returns:

```json
{
  "latestOutcome": "DELIVERED_TO_PROVIDER",
  "attempts": [
    {
      "id": "clx...",
      "outcome": "DELIVERED_TO_PROVIDER",
      "recipientEmail": "client@acme.com",
      "failureCode": null,
      "failureReason": null,
      "attemptedBy": "user-abc",
      "attemptedAt": "2024-06-02T09:15:00.000Z"
    },
    {
      "id": "clx...",
      "outcome": "FAILED",
      "recipientEmail": "client@acme.com",
      "failureCode": 422,
      "failureReason": "Domain not verified",
      "attemptedBy": null,
      "attemptedAt": "2024-06-01T10:00:00.000Z"
    }
  ]
}
```

Attempts are ordered newest-first. `latestOutcome` is `null` if no attempts exist (offer
was never sent, which should not happen in practice since `send` always creates an attempt).

`attemptedBy: null` means the system triggered the delivery (initial send action, which is
always system-initiated). A non-null value is a user ID (the sender who clicked "Resend").

---

## 6. Notification Emails (Acceptance, Decline)

Acceptance confirmation emails (to sender and recipient) and decline notification emails
are **best-effort only** and are **not** tracked in `OfferDeliveryAttempt`.

Rationale:
- These are informational, not action-gating — the recipient does not need them to proceed
- Failure does not affect business state (the acceptance record and certificate exist)
- The acceptance/decline state is authoritative; the email is a convenience notification

If these emails fail, the failure is logged at ERROR level and execution continues normally.

---

## 7. Provider Limitations

`DELIVERED_TO_PROVIDER` indicates Resend accepted the message for delivery. It does not
indicate:

- The message reached the recipient's inbox
- The message was not filtered as spam
- The recipient opened or read the email

For inbox-level delivery verification, use Resend's webhook events (not implemented in v1).

For DMARC alignment and DNS configuration prerequisites, see [docs/email.md](email.md).

---

## 8. What Delivery Status Proves — and Does Not Prove

This section clarifies exactly what `OfferDeliveryAttempt.outcome` tells you in support
case views, timeline reviews, and dispute investigations.

### `DELIVERED_TO_PROVIDER` proves:

- The email message was accepted by Resend (or whichever provider is configured) for
  delivery. The provider returned HTTP 2xx.
- The message was addressed to the correct recipient email at the time of dispatch.
- A `tokenHash` is recorded in the attempt, linking the attempt to the specific signing
  link that was sent in that email.

### `DELIVERED_TO_PROVIDER` does NOT prove:

- The message reached the recipient's inbox (provider acceptance ≠ inbox delivery)
- The message was not filtered into spam
- The recipient opened or read the email
- The recipient clicked the signing link

### `FAILED` proves:

- The email provider rejected the message, or a network error occurred before the
  provider could respond. The signing link was issued but the email was not accepted.

### `FAILED` does NOT prove:

- The recipient did not receive the offer — a subsequent resend may have succeeded.
  Always check all delivery attempts, not just the most recent.

### Support interpretation guide

When investigating a dispute where the recipient claims they did not receive the offer:

1. Check `deliveryAttempts` in the case view — look for at least one `DELIVERED_TO_PROVIDER`.
2. If all attempts are `FAILED`, the email was never accepted by the provider. This is
   a delivery failure, not a signing failure.
3. If there is a `DELIVERED_TO_PROVIDER` attempt, the provider accepted it. Check
   whether a `SigningSession` was created (which requires the recipient to have clicked
   the link). A session means the link was followed.
4. If a session exists, check for `OTP_VERIFIED` and `OFFER_ACCEPTED` events in the
   signing event chain. These are the authoritative evidence of recipient engagement.

**Never use `DELIVERED_TO_PROVIDER` alone as proof that the recipient read the email.**
Use the signing event chain for proof of recipient engagement.

---

## 9. v1 Limitations and Future Work

| Limitation | Future improvement |
|------------|--------------------|
| No inbox-level delivery confirmation | Resend webhook integration |
| Resend allowed even after `DELIVERED_TO_PROVIDER` | Add domain rule: only allow resend after `FAILED` |
| No rate limiting on resend | Add max resend attempts per offer per time window |
| `DISPATCHING` state left if process crashes mid-send | Background job to reconcile stale `DISPATCHING` records |
| No resend for notification emails | Add retry queue for acceptance/decline notifications |
