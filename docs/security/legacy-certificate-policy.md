# Legacy Certificate Policy

## What is a legacy certificate?

A legacy certificate is any `AcceptanceCertificate` row where `canonicalHash IS NULL`.

`canonicalHash` is a SHA-256 hash of the five-field acceptance fingerprint:
`(acceptedAt, dealId, ipAddress, recipientEmail, userAgent)`.
It was introduced by migration `20260328_certificate_canonical_hash`.

Certificates issued before that migration cannot be retrospectively given a
`canonicalHash` because the hash would need to be signed at issuance time for
the linkage to be meaningful.

## What guarantees do legacy certificates still provide?

| Check | Legacy | Modern |
|---|---|---|
| `certificateHash` covers full payload | ✅ | ✅ |
| `OfferSnapshot` content hash verified | ✅ | ✅ |
| Signing event chain verified | ✅ | ✅ |
| `canonicalHash` (5-field fingerprint) | ❌ absent | ✅ |
| `acceptanceStatementHash` in event | ❌ absent | ✅ (Phase 3+) |
| `recipientName` frozen in record | ❌ absent | ✅ (Phase 2+) |

Legacy certificates pass `certificateHash`, `snapshotIntegrity`, and
`eventChainValid` checks. They cannot provide the independent five-field
fingerprint that allows a third party to verify the acceptance without
retrieving the full payload.

## How does the verification page display legacy certificates?

Since Phase 1 (HIGH-1) hardening:

- `valid: false` — legacy certificates are never displayed with the green
  "Certificate valid" tick.  `valid === true` is now reserved for certificates
  that pass every check including `canonicalHash`.
- `integrityChecksPass: true` — all available crypto checks pass; no tampering
  is detected.
- The verify page renders an **amber "Legacy certificate"** state with the
  message: *"All available integrity checks passed. This certificate was issued
  before full canonical fingerprinting was introduced."*

This distinction matters for relying parties: a green tick means the record is
fully verifiable; an amber state means the record has not been tampered with but
lacks the modern fingerprint guarantee.

## Why `valid=false` and not a separate tri-state?

Keeping `valid: boolean` strict (rather than adding a third enum value) means:

1. All existing callers that only check `valid` are correct: they will never
   silently treat a legacy cert as fully trusted.
2. The `integrityChecksPass` field gives the display layer what it needs to
   distinguish amber from red without a breaking change.
3. The strict invariant `valid === (integrityChecksPass && advisoryAnomalies.length === 0)`
   is enforced in code (`certificate.service.ts`) and is easy to reason about.

## Can legacy certificates be upgraded?

No. Retroactively computing `canonicalHash` and writing it to existing rows
would break the security model: the hash is only trustworthy when it was
committed to the database at the moment of acceptance, before anyone could
observe the outcome.

If a relying party requires modern guarantees for a legacy certificate, the
original acceptance flow should be treated as advisory-only, and the parties
should establish a new signed agreement using the current system.

## How many legacy certificates exist?

Run:

```sql
SELECT COUNT(*) FROM acceptance_certificates WHERE "canonicalHash" IS NULL;
```

All certificates issued before migration `20260328_certificate_canonical_hash`
are legacy. All new acceptances produce modern certificates.

## Operational checklist

- Do not back-fill `canonicalHash` on existing rows.
- Do not change `LEGACY_CERTIFICATE` from an advisory to an integrity anomaly.
- When adding new certificate fields, apply the same pattern: nullable for
  backward compatibility; pre-populate on all new acceptances; treat absence
  as advisory-only in `verify()`.
