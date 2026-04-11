# Known Test Failures — Audit Log

This file documents test failures identified during the 2026-04-11 audit session,
their root causes, classifications, and resolutions.

**Audit result: all failures were bugs, not obsolete tests. All 7 were fixed.**

---

## Summary

| # | Test file | Test name | Classification | Status |
|---|-----------|-----------|----------------|--------|
| 1 | `session-rotation.spec.ts` | `rotate()` — revokes old session | Bug: stale call signature | Fixed |
| 2 | `session-rotation.spec.ts` | `rotate()` — returns different rawToken | Bug: stale call signature | Fixed |
| 3 | `webhooks.spec.ts` | (entire suite — failed to compile) | Bug: stale constructor arity | Fixed |
| 4 | `token-refresh.spec.ts` | `returns 401 when refreshToken cookie is missing` | Bug: stale assertion pattern | Fixed |
| 5 | `org-crud.spec.ts` | (entire suite — DI error) | Bug: missing mock provider | Fixed |
| 6 | `logging-redaction.spec.ts` | `env.ts allows EMAIL_PROVIDER=resend in production` | Bug: fixture missing new required field | Fixed |
| 7 | `certificate-tampering.spec.ts` | (6 tests — anomaly count off by 1) | Bug: fixtures predate canonicalHash feature | Fixed |

---

## Failure Details

### 1–2. `test/auth/session-rotation.spec.ts` — stale `rotate()` call signature

**Classification:** Bug in test

**Root cause:**  
`SessionService.rotate()` gained a new third parameter `inheritedFamilyId: string | null | undefined`
(for token family tracking) between when the tests were written and when the family tracking
feature was merged. The tests called `rotate(sessionId, userId, context)` but the method
now requires `rotate(sessionId, userId, inheritedFamilyId, context)` — 4 arguments.

**Fix:**  
Updated both calls in `rotate()` describe block to pass `null` as `inheritedFamilyId`:
```diff
- await service.rotate('session-old', 'user-1', {});
+ await service.rotate('session-old', 'user-1', null, {});
```

---

### 3. `test/enterprise/webhooks.spec.ts` — `WebhookService` constructor arity

**Classification:** Bug in test (TypeScript compilation failure)

**Root cause:**  
`WebhookService` constructor was updated to inject `ConfigService` as a third parameter
(required to read `WEBHOOK_SECRET_KEY` for the at-rest secret cipher). The test factory
called `new WebhookService(prisma, jobs)` with 2 arguments; TypeScript rejected it.

**Fix:**  
Passed a minimal `ConfigService` stub as the third argument:
```diff
- factory: (prisma, jobs) => new WebhookService(prisma as never, jobs as never),
+ factory: (prisma, jobs) =>
+   new WebhookService(prisma as never, jobs as never, { get: () => undefined } as never),
```

The stub returns `undefined` for `WEBHOOK_SECRET_KEY`, which causes `WebhookService`
to operate in no-cipher mode (acceptable for unit tests that don't test encryption).

---

### 4. `test/auth/token-refresh.spec.ts` — stale `res.status(401)` assertion

**Classification:** Bug in test

**Root cause:**  
`AuthController.refresh()` was refactored from directly calling `res.status(401).json()`
when the refresh cookie is absent, to throwing `UnauthorizedException` and letting NestJS's
exception filter produce the 401 response (the correct NestJS pattern). The test still
asserted `res.status` was called with `401`, which was no longer true.

Because the test calls the controller method directly (without NestJS's full HTTP stack),
the exception filter does not run, so the right assertion is that the method throws.

**Fix:**  
```diff
- await controller.refresh(buildMockReq(undefined) as never, res as never);
- expect(res.status).toHaveBeenCalledWith(401);
- expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
+ await expect(
+   controller.refresh(buildMockReq(undefined) as never, buildMockRes() as never),
+ ).rejects.toThrow(UnauthorizedException);
```

---

### 5. `test/organizations/org-crud.spec.ts` — missing `DpaService` mock

**Classification:** Bug in test (NestJS DI error at module compile time)

**Root cause:**  
`OrgController` was updated to inject `DpaService` as a new dependency (to serve the
DPA accept/status endpoint on the org controller). The test's `createTestingModule()`
providers array was not updated to include a mock `DpaService`, so NestJS threw
a dependency-resolution error before any test ran.

**Fix:**  
Added a minimal mock to the test module's providers:
```diff
+ { provide: DpaService, useValue: { getDpaStatus: jest.fn().mockResolvedValue(null) } },
```

---

### 6. `test/logging/logging-redaction.spec.ts` — `validateEnv` fixture missing `WEBHOOK_SECRET_KEY`

**Classification:** Bug in test (fixture predates a new required env var)

**Root cause:**  
`env.ts` was updated to require `WEBHOOK_SECRET_KEY` (exactly 64 hex chars) in production.
The test fixture for "allows EMAIL_PROVIDER=resend in production" did not include this
field, so `validateEnv` threw on a missing required variable rather than passing.

**Fix:**  
Added the field to the production env fixture:
```diff
+ WEBHOOK_SECRET_KEY: '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
```

The value matches the 64-hex-char format required by the validator; it is the same
test key used in CI's `test-api` job environment.

---

### 7. `test/certificates/certificate-tampering.spec.ts` — `canonicalHash: null` inflates anomaly counts

**Classification:** Bug in test (fixtures predate the `canonicalHash` feature)

**Root cause:**  
`CertificateService.verify()` was updated to add a `LEGACY_CERTIFICATE` informational
anomaly whenever `AcceptanceCertificate.canonicalHash` is `null`. This represents
certificates issued before the canonical 5-field acceptance fingerprint was introduced.

All test fixtures hardcoded `canonicalHash: null`, causing every call to `verify()`
to append the `LEGACY_CERTIFICATE` anomaly. Tests that asserted `anomaliesDetected.length`
to be 0, 1, 2, or 3 received 1, 2, 3, or 4 respectively.

Additionally, the fixtures omitted `offerId` from the cert row, which the canonical hash
re-computation reads for the `dealId` field.

**Fix:**  
1. Imported `computeCanonicalAcceptanceHash` into the test file.
2. Pre-computed the correct canonical hash from the fixture's acceptance-record data.
3. Updated the cert fixture to include both `offerId` and the computed `canonicalHash`.

```diff
+ const CANONICAL_HASH = computeCanonicalAcceptanceHash({
+   acceptedAt: '2024-06-01T11:59:00.000Z',
+   dealId: OFFER_ID,
+   ipAddress: '1.2.3.4',
+   recipientEmail: 'bob@client.com',
+   userAgent: 'Mozilla/5.0',
+ }).hash;

  // cert fixture:
+ offerId: OFFER_ID,
- canonicalHash: null,
+ canonicalHash: CANONICAL_HASH,
```

This makes the test fixtures represent "modern" certificates that have a canonicalHash,
so the LEGACY_CERTIFICATE anomaly is not triggered and anomaly counts are accurate.

---

## No Obsolete Tests Found

All 7 failures were bugs caused by:
- Production code changes that were not reflected in test call signatures or fixtures
- New required fields/parameters added to production code after the tests were written

None of the failing tests were testing removed functionality or were otherwise obsolete.
The test intent (what each test was asserting) remained valid; only the mechanics needed updating.

---

## Prevention

To prevent similar fixture drift in future:

1. **When changing a method signature**, search for all call sites in `test/` and update them.
2. **When adding a required constructor parameter** to a NestJS provider, grep for manual
   instantiation (`new ServiceName(`) in test files and add mock values.
3. **When adding a required env var**, add it to both `apps/api/.env.example` and any
   inline `validateEnv({...})` calls in tests.
4. **When adding new anomaly categories** to a verify/check service, update test fixtures
   to satisfy the new conditions or explicitly test the new anomaly path separately.
