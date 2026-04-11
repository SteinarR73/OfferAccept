# Evidence Integrity Audit — OfferAccept

**Date:** 2026-04-11  
**Scope:** Certificate integrity · DealEvent integrity chain · Hash calculation logic ·  
Event ordering guarantees · Replay and mutation risks  
**Audited by:** Architecture review (AI-assisted)  
**Status:** 3 HIGH · 4 MEDIUM · 3 LOW · 0 CRITICAL

---

## Executive Summary

The OfferAccept evidence model is well-architected for its threat tier. Immutable tables
(`AcceptanceRecord`, `OfferSnapshot`, `SigningEvent`) are correctly separated from mutable
operational tables. Hash computation is deterministic and reproducible. The certificate
verification flow reads evidence and hashes independently, with no short-circuit. The signing
event chain correctly binds each event to the previous via hash chain.

No path was found by which an application-level attacker (API access, JWT bypass) can forge
a valid certificate that `verify()` would accept. All forgery paths identified below require
direct database write access to multiple tables.

Three HIGH findings must be fixed before this system is used in any legal or regulatory
context: a documentation-level API contract violation that misleads callers checking only
`valid`, a mutable data source embedded in the certificate hash, and a gap in the hash chain
coverage of the acceptance statement.

---

## Findings

### HIGH-1 — `valid: true` returned for legacy certificates despite non-empty `anomaliesDetected`

**File:** [apps/api/src/modules/certificates/certificate.service.ts](apps/api/src/modules/certificates/certificate.service.ts#L329)

**Description:**

The `VerificationResult` interface documents:

```typescript
// Top-level validity: true only when ALL checks pass.
valid: boolean;

// Human-readable list of all detected problems. Empty when valid=true.
anomaliesDetected: string[];
```

The comment establishes a contract: if `valid` is `true`, `anomaliesDetected` must be empty.

For legacy certificates (`canonicalHash === null`) the code does:

```typescript
// certificate.service.ts:321-328
if (cert.canonicalHash === null) {
  anomalies.push('LEGACY_CERTIFICATE: This certificate was issued before the canonical ...');
}
const canonicalHashOk = canonicalHashMatch ?? true;   // undefined ?? true = true

return {
  valid: certificateHashMatch && canonicalHashOk && snapshotIntegrity && chainResult.valid,
  anomaliesDetected: anomalies,  // non-empty
};
```

Result: for a legacy certificate where all three remaining checks pass, the response is
`valid: true` with a non-empty `anomaliesDetected`. This directly violates the documented
invariant.

**Impact:**

Any caller (frontend, webhook consumer, third-party integration) that checks only
`result.valid === true` will treat a legacy certificate as fully verified without seeing the
LEGACY_CERTIFICATE flag. The 5-field canonical acceptance binding (`acceptedAt`, `dealId`,
`ipAddress`, `recipientEmail`, `userAgent`) cannot be independently verified for these
certificates, but the response signals they are "valid".

The `canonicalHashMatch: undefined` field is the only correct signal, but callers must
explicitly check for `undefined` rather than `false` — an unusual and easily-missed
distinction.

**Recommendation:**

Option A (preferred): Introduce a `PARTIAL` validity state distinct from `true` and `false`.

```typescript
valid: 'FULL' | 'PARTIAL' | 'INVALID';
// FULL    — all checks passed, no anomalies
// PARTIAL — all applicable checks passed, but at least one check was N/A (legacy cert)
// INVALID — at least one check failed
```

Option B: Keep `valid: boolean` but set it to `false` whenever `anomaliesDetected` is
non-empty. Callers would then handle `valid: false` with reason
`LEGACY_CERTIFICATE` separately from `valid: false` with reason `HASH_MISMATCH`.

Option C (minimal): Update the comment to accurately reflect the invariant, and update the
public API documentation to state that legacy certificates return `valid: true` but
`anomaliesDetected` may be non-empty.

---

### HIGH-2 — `OfferRecipient.name` is mutable but used in certificate hash computation

**Files:**
- [apps/api/src/modules/certificates/certificate-payload.builder.ts](apps/api/src/modules/certificates/certificate-payload.builder.ts#L79)
- [packages/database/prisma/schema.prisma](packages/database/prisma/schema.prisma#L444)

**Description:**

`CertificatePayloadBuilder.build()` reads the recipient's name directly from `OfferRecipient`:

```typescript
// certificate-payload.builder.ts:79-82
const recipient = await this.db.offerRecipient.findUniqueOrThrow({
  where: { id: record.recipientId },
});
// ...
recipient: {
  name: recipient.name,   // <── read from mutable OfferRecipient
  verifiedEmail: record.verifiedEmail,
},
```

`OfferRecipient` has `updatedAt DateTime @updatedAt` — it is a mutable entity. The service
itself documents the prohibition: "Never reads: Offer, User, Organization (mutable entities)."
`OfferRecipient` is in the same mutable category but is excluded from this rule in practice.

`AcceptanceRecord` (immutable) does not capture `recipientName`. The name is therefore not
frozen at acceptance time.

**Impact — Correctness (false positive):**

Any update to `OfferRecipient.name` after acceptance (spelling correction, legal name change
entered in a UI) causes `verify()` to return `certificateHashMatch: false`. The certificate
appears tampered when it was not. There is no recovery path other than re-generating the
certificate with a new hash.

**Impact — Forgery vector (database write access required):**

An attacker with write access to `offer_recipients` and `acceptance_certificates` can:
1. UPDATE `offer_recipients SET name = 'Forged Name' WHERE id = ?`
2. Recompute `certificateHash` with the new name in the payload
3. UPDATE `acceptance_certificates SET certificateHash = ? WHERE id = ?`

`verify()` returns `valid: true` for the modified certificate. The acceptance statement in
the certificate reads "I, Forged Name, confirm..." — the original identity is lost.

**Recommendation:**

Add `recipientName String` to `AcceptanceRecord`. Populate it from `OfferRecipient.name`
inside the acceptance transaction (when the name is certain). Update
`CertificatePayloadBuilder.build()` to read `record.recipientName` instead of
`recipient.name`.

Migration: add a `NOT NULL` column with a backfill from `offer_recipients` via the
`recipientId` FK, then flip to NOT NULL. This is the same pattern used for `snapshotId`.

No change to the certificate payload structure is required — the field name in the JSON
remains `recipient.name`.

---

### HIGH-3 — Hash chain does not bind acceptance statement content

**Files:**
- [apps/api/src/modules/signing/services/acceptance.service.ts](apps/api/src/modules/signing/services/acceptance.service.ts#L176)
- [apps/api/src/modules/signing/domain/signing-event.builder.ts](apps/api/src/modules/signing/domain/signing-event.builder.ts#L37)

**Description:**

`OFFER_ACCEPTED` is the terminal event in the signing chain. Its payload is:

```typescript
// acceptance.service.ts:180-185
payload: {
  acceptanceRecordId: record.id,    // pointer to the record
  verifiedEmail: challenge.deliveryAddress,
  acceptedAt: acceptedAt.toISOString(),
  snapshotContentHash: snapshot.contentHash,
},
```

The acceptance statement — the exact words the recipient agreed to — is stored in
`AcceptanceRecord.acceptanceStatement` but is **not included** in the `OFFER_ACCEPTED`
event payload. The hash chain commits to `acceptanceRecordId` (a pointer) rather than
the statement's content.

**Impact:**

The signing event chain verifies that the sequence of events occurred and has not been
altered, but it does not independently bind the text of the agreement. The only integrity
protection for the statement text is `AcceptanceCertificate.certificateHash` (which covers
the full payload). However:

1. A database-level attacker who changes `AcceptanceRecord.acceptanceStatement` and
   recomputes `certificateHash` produces a certificate that passes all four `verify()` checks.
   The event chain does not detect the statement mutation because it only committed to
   `acceptanceRecordId`.

2. A third party doing lightweight verification via `canonicalHash` (the 5-field fingerprint)
   cannot verify the statement at all — the 5 fields are `acceptedAt`, `dealId`, `ipAddress`,
   `recipientEmail`, `userAgent`. The statement is absent.

**Recommendation:**

Include a hash of the acceptance statement in the `OFFER_ACCEPTED` event payload:

```typescript
payload: {
  acceptanceRecordId: record.id,
  acceptanceStatementHash: crypto.createHash('sha256')
    .update(acceptanceStatement, 'utf8').digest('hex'),
  verifiedEmail: challenge.deliveryAddress,
  acceptedAt: acceptedAt.toISOString(),
  snapshotContentHash: snapshot.contentHash,
},
```

This makes the event hash chain commit to the statement content, not just a pointer. Future
`verify()` can recompute the statement hash from `AcceptanceRecord.acceptanceStatement` and
compare against the stored event payload value — adding a fifth independent integrity check.

Do **not** include the raw statement text in the event payload (it may contain PII; event
payloads are more broadly accessible than the full certificate).

---

### MEDIUM-4 — DealEvents have no hash chain

**Files:**
- [apps/api/src/modules/deal-events/deal-events.service.ts](apps/api/src/modules/deal-events/deal-events.service.ts)
- [packages/database/prisma/schema.prisma](packages/database/prisma/schema.prisma#L1021)

**Description:**

`DealEvent` rows carry no hash chain. Unlike `SigningEvent` (which has `previousEventHash`,
`eventHash`, and `@@unique([sessionId, sequenceNumber])`), `DealEvent` has only `id`,
`dealId`, `eventType`, `metadata`, and `createdAt`.

A database-level attacker can:
- INSERT fabricated events (e.g. a `deal_sent` event before a `deal_accepted` event)
- DELETE events (e.g. remove a `deal_revoked` event)
- UPDATE `metadata` (e.g. change the `certificateId` in a `certificate_issued` event)

None of these mutations are detected by `CertificateService.verify()`.

**Mitigating context:**

`DealEvent` is the activity log, not the certificate trust chain. Certificate integrity is
verified via `SigningEvent` chain, not `DealEvent`. The `verify()` method does not inspect
`DealEvent` at all. The certificate's tamper evidence is not weakened by DealEvent mutations.

**Impact:**

Investigations and dispute resolution rely on the deal timeline, which is built from
`DealEvent` rows. A manipulated timeline could mislead an investigator while the certificate
itself verifies correctly. The mismatch between a "clean" certificate and a manipulated
timeline would itself be suspicious but is not algorithmically detected.

**Recommendation:**

The immediate risk is low because `DealEvent` is not part of certificate verification.
However, for a system claiming a tamper-evident record, the activity log should offer the
same guarantees as the signing event log.

Short term: add a `sequenceNumber` per deal and a `@@unique([dealId, sequenceNumber])`
constraint. This prevents insertion of phantom events into an existing sequence without
modifying later events' sequence numbers.

Long term: add a lightweight hash chain (same algorithm as `SigningEvent`) so that
`DealEvent` integrity can be independently verified, and surface it in the `verify()`
response as a fifth check.

---

### MEDIUM-5 — DealEvent archival deletes source rows, contradicting the "never deleted" schema guarantee

**Files:**
- [packages/database/prisma/schema.prisma](packages/database/prisma/schema.prisma#L992)
- [apps/api/src/modules/jobs/handlers/archive-deal-events.handler.ts](apps/api/src/modules/jobs/handlers/archive-deal-events.handler.ts#L126)

**Description:**

The schema comment for `DealEvent` states:

```
// Events are append-only; never updated or deleted.
```

The archival handler deletes source rows:

```typescript
// archive-deal-events.handler.ts:126
const { count: deletedCount } = await tx.dealEvent.deleteMany({
  where: { id: { in: ids } },
});
```

This is architecturally intentional (move to cold store), but the schema comment is false.

**Impact — Query correctness:**

Code that reads `deal_events` to reconstruct a full timeline will silently omit events
older than 18 months. There is no transparent fallback that merges both tables. A developer
who writes `db.dealEvent.findMany({ where: { dealId } })` will see an incomplete timeline
without any error or warning.

**Impact — Audit correctness:**

Audit tooling, compliance queries, and support investigations that query only `deal_events`
will miss archived history without knowing they are doing so.

**Recommendation:**

1. Update the schema comment to accurately state the retention policy:
   > Events are append-only and are never updated. Rows older than 18 months are moved
   > to `deal_events_archive` by the daily archival job — see `DealEventArchive`.

2. Add a unified query helper (e.g. `DealEventService.getFullHistory(dealId)`) that
   merges both tables transparently, ordered by `createdAt`. All timeline consumers should
   use this helper rather than querying `deal_events` directly.

3. Consider whether `DealEventArchive` rows need a `NOT NULL` FK to `deal_events_archive`
   instead of relying on the archival job to guarantee integrity.

---

### MEDIUM-6 — Certificate PDF embeds stored `certificateHash`, not the recomputed value

**Files:**
- [apps/api/src/modules/certificates/certificate.service.ts](apps/api/src/modules/certificates/certificate.service.ts#L456)
- [apps/api/src/modules/certificates/certificate-pdf.service.ts](apps/api/src/modules/certificates/certificate-pdf.service.ts#L17)

**Description:**

`getExportForJob()` (used by the PDF generation background job) returns the stored
`certificateHash`:

```typescript
// certificate.service.ts:456-459
return {
  certificateId: cert.id,
  certificateHash: cert.certificateHash,  // stored value — never recomputed
  ...
```

The `CertificatePdfService` design note confirms this is intentional:

```typescript
// certificate-pdf.service.ts:17
// Uses the stored certificateHash — never recomputes it.
```

By contrast, `exportPayload()` (the authenticated JSON export endpoint) always recomputes
the hash from current evidence via `builder.build()`.

**Impact:**

The PDF is generated once and may be downloaded many times. If an attacker modifies
`AcceptanceCertificate.certificateHash` in the database after the PDF was generated, the PDF
and the API verify response diverge: the PDF shows the modified hash, while `verify()` shows
a mismatch. A PDF recipient who validates the hash printed on the PDF by re-hashing the
payload themselves would get the recomputed (correct) hash — which would NOT match the
tampered hash on the PDF, revealing the tampering. This is correct behavior.

However, if the PDF has not yet been generated at the time of tampering, the newly generated
PDF would embed the tampered hash. A PDF consumer who verifies by comparing the PDF hash
against the API `verify()` response would catch this (mismatch), but a consumer who only
checks the PDF hash against the payload manually would not — they would recompute the same
tampered hash and consider it "verified".

**Recommendation:**

Pass the recomputed hash (from `builder.build()`) to `CertificatePdfService.generate()`
rather than the stored value. The cost is one extra `builder.build()` call per PDF
generation job, which reads immutable tables and is safe to call multiple times.

```typescript
// In getExportForJob() or in the issue-certificate handler:
const built = await this.builder.build(cert.id, certificateId, cert.issuedAt);
// Pass built.certificateHash to the PDF generator, not cert.certificateHash.
```

This ensures the PDF always displays a hash that matches the evidence, regardless of what
was stored in the `certificateHash` column.

---

### MEDIUM-7 — `getExportForJob()` authorization bypass has no runtime enforcement

**File:** [apps/api/src/modules/certificates/certificate.service.ts](apps/api/src/modules/certificates/certificate.service.ts#L448)

**Description:**

```typescript
// certificate.service.ts:445-448
// Returns the export payload for a certificate without org authorization.
// ONLY for use in trusted background job handlers — never in HTTP controllers.
async getExportForJob(certificateId: string): Promise<{...}> {
```

The method bypasses `assertCanAccess()`. The authorization constraint is enforced only
through a comment. No runtime guard prevents `getExportForJob()` being called from an
HTTP controller, either accidentally (misuse by a future developer) or intentionally
(if a controller is added that calls it in error).

**Impact:**

If this method is ever called from an authenticated HTTP endpoint, all certificates become
accessible to any authenticated user regardless of organization. The same `CertificateService`
instance is injected into both job handlers and HTTP controllers; the method is a public
instance method reachable from either.

**Recommendation:**

Two options:

Option A: Extract `getExportForJob()` into a separate `InternalCertificateService` that is
not exported from `CertificatesModule` and is only imported by `JobsModule`. This makes
accidental HTTP exposure structurally impossible.

Option B: Add a parameter-level guard that enforces the calling context:

```typescript
async getExportForJob(
  certificateId: string,
  _callerContext: 'JOB_HANDLER',  // forces callers to assert intent
): Promise<{...}> {
```

Option A is preferred as it is enforced at compile time.

---

### LOW-8 — Advisory lock uses 32-bit hash; birthday collision at moderate scale

**File:** [apps/api/src/modules/signing/services/signing-event.service.ts](apps/api/src/modules/signing/services/signing-event.service.ts#L83)

**Description:**

```typescript
await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.sessionId})::bigint)`;
```

`hashtext()` returns `int4` (32 bits). Casting to `bigint` widens the type but does not
increase entropy — only the lower 32 bits carry distinct values.

The comment in the code correctly identifies this and gives a migration path. The comment
states the risk as "~1/2^32 per pair", but by the birthday paradox, the probability of
*any* collision among `n` active sessions is approximately `n² / 2^33`. With 65,000
concurrent sessions, expected collisions exceed 50%.

**Impact:**

A collision causes two unrelated signing sessions to share an advisory lock. Concurrent
event appends from those sessions will serialize unnecessarily. There is **no data
corruption** — the unique constraint `@@unique([sessionId, sequenceNumber])` prevents
sequence number reuse even if the lock does not fully serialize. The only impact is a
performance bottleneck at high concurrency.

This is a correctness concern, not a security vulnerability.

**Recommendation:**

Implement the migration path already documented in the code (take the first 8 bytes of
SHA-256 of the sessionId, interpret as signed int64, pass to
`pg_advisory_xact_lock()`). At current scale (v1 launch) this can be deferred; it should
be implemented before the session pool reaches ~50,000 concurrent active sessions.

---

### LOW-9 — Webhook endpoint secret stored in plaintext

**File:** [packages/database/prisma/schema.prisma](packages/database/prisma/schema.prisma#L958)

**Description:**

```prisma
model WebhookEndpoint {
  secret String @db.VarChar(64)   // 32 bytes hex-encoded
```

All other credentials in the schema are stored as SHA-256 hashes:
`Session.refreshTokenHash`, `OfferRecipient.tokenHash`, `SigningOtpChallenge.codeHash`,
`ApiKey.keyHash`. The webhook secret is the only credential stored in recoverable form.

**Why this is necessary:** The webhook secret must be read server-side to compute HMAC
signatures on outgoing payloads. One-way hashing would make outbound signing impossible.

**Impact:**

If an attacker gains read access to the `webhook_endpoints` table (e.g. via SQL injection,
a backup leak, or DB credential theft), they can read all webhook secrets and forge
HMAC-signed webhook payloads to any customer endpoint. This is a lower-risk scenario than
theft of user credentials (secrets are outbound-signing keys, not authentication tokens),
but it breaks the integrity of the customer's webhook integration.

**Recommendation:**

Encrypt the secret column at rest using an application-level encryption key (envelope
encryption):

1. Generate a 256-bit AES key stored in the environment / secrets manager (not the DB).
2. On write: `encryptedSecret = AES-256-GCM(rawSecret, DEK)`.
3. On read: decrypt before use.
4. Rotate the DEK periodically without needing to re-issue secrets to customers.

This is the standard pattern for columns that must be both recoverable and protected. The
webhook secret is the only column in the schema that needs this treatment.

---

### LOW-10 — `canonicalHash` 5-field fingerprint does not cover acceptance statement

**File:** [apps/api/src/modules/certificates/certificate-payload.builder.ts](apps/api/src/modules/certificates/certificate-payload.builder.ts#L175)

**Description:**

The `canonicalHash` is intended to allow third-party verification using only five fields:
`acceptedAt`, `dealId`, `ipAddress`, `recipientEmail`, `userAgent`. The acceptance statement
— the exact text the recipient agreed to — is not included.

A third party who receives only these five values can verify *who* accepted, *when*, and
*from where*, but cannot independently verify *what* they agreed to.

**Impact:**

This is a documented trade-off (the canonical hash is described as a "lightweight
5-field fingerprint"). The full acceptance statement is verifiable via the full
`certificateHash`. However, the 5-field fingerprint is what third-party integrators and
external legal tools will most easily consume, and its scope limitation is not surfaced
prominently in the `verify()` response.

The impact of HIGH-3 (hash chain not binding the statement) is amplified here: neither the
lightweight canonical hash nor the event chain commit to the statement text. Only the full
`certificateHash` does.

**Recommendation:**

Add a 6th field: `acceptanceStatementHash` (SHA-256 of the statement text) to the canonical
fingerprint. This does not expose statement PII, adds only one field to the verification
path, and means the canonical hash can confirm what the recipient agreed to without needing
the full payload.

This recommendation is stronger if HIGH-3 is not implemented; if HIGH-3 is implemented
(statement hash in event payload), the statement is already bound by two independent
mechanisms.

---

## Verification of Stated Properties

| Property | Status | Evidence |
|----------|--------|---------|
| 1. Certificate hash cannot be recomputed after acceptance | **HOLDS** — with gap | `issuedAt` is stored and used as the deterministic input; hash is reproducible. Gap: `OfferRecipient.name` is mutable (HIGH-2). |
| 2. Event payload mutations cannot alter the certificate | **HOLDS** | `verify()` reads evidence independently; stored hash is the comparison target, not the source of truth. |
| 3. Archived DealEvents cannot be modified without detection | **DOES NOT HOLD** | DealEvents have no hash chain. Modifications to both active and archived rows are undetected (MEDIUM-4). |
| 4. CanonicalHash correctly represents the acceptance evidence | **PARTIALLY HOLDS** | 5-field fingerprint is deterministic and correctly computed. Gap: does not include acceptance statement (HIGH-3, LOW-10). |
| 5. Legacy certificates are clearly flagged and not treated as trusted | **PARTIALLY HOLDS** | `anomaliesDetected` always includes `LEGACY_CERTIFICATE`. Gap: `valid: true` is returned simultaneously (HIGH-1). |

---

## Summary Table

| ID | Severity | Title |
|----|----------|-------|
| HIGH-1 | **HIGH** | `valid: true` returned for legacy certificates despite non-empty `anomaliesDetected` |
| HIGH-2 | **HIGH** | `OfferRecipient.name` is mutable but used in certificate hash computation |
| HIGH-3 | **HIGH** | Hash chain does not bind acceptance statement content |
| MEDIUM-4 | **MEDIUM** | DealEvents have no hash chain |
| MEDIUM-5 | **MEDIUM** | DealEvent archival deletes source rows, contradicting "never deleted" guarantee |
| MEDIUM-6 | **MEDIUM** | Certificate PDF embeds stored `certificateHash`, not the recomputed value |
| MEDIUM-7 | **MEDIUM** | `getExportForJob()` authorization bypass has no runtime enforcement |
| LOW-8 | **LOW** | Advisory lock uses 32-bit hash; birthday collision at moderate scale |
| LOW-9 | **LOW** | Webhook endpoint secret stored in plaintext |
| LOW-10 | **LOW** | `canonicalHash` fingerprint does not cover acceptance statement |

---

## Remediation Priority

### Immediate (before production use in legal/regulatory context)

1. **HIGH-2** — Freeze `recipientName` into `AcceptanceRecord`. This is a schema change that
   must happen before any acceptance records exist in production, otherwise a migration is
   needed to backfill names from `OfferRecipient`.

2. **HIGH-1** — Resolve the `valid` / `anomaliesDetected` contract violation. Pick one of the
   three options in the finding. Option A (tri-state validity) requires an API version bump
   if consumers already exist.

3. **HIGH-3** — Add `acceptanceStatementHash` to the `OFFER_ACCEPTED` event payload. This is
   backward compatible (adds a field to a JSON payload; existing events remain verifiable
   without it).

### Short term (first production sprint)

4. **MEDIUM-6** — Pass recomputed hash to PDF generator. One-line change in the job handler.

5. **MEDIUM-7** — Extract `getExportForJob()` to `InternalCertificateService`. Structural
   refactor with no functional change.

6. **MEDIUM-5** — Update schema comment and add `getFullHistory()` helper. Low risk.

### Pre-scale (before reaching ~10,000 monthly active users)

7. **MEDIUM-4** — Add `sequenceNumber` and `@@unique` to `DealEvent`. Hash chain can follow.

8. **LOW-8** — Implement SHA-256-based advisory lock key derivation.

### Architecture backlog

9. **LOW-9** — Webhook secret envelope encryption (requires KMS or secrets manager
   integration).

10. **LOW-10** — Add `acceptanceStatementHash` to canonical fingerprint.
