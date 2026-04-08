# Legal Review — Pre-Launch Sign-Off

This document must be completed by legal counsel before OfferAccept accepts real
customer traffic. Each section describes what the legal reviewer must assess,
what evidence is available in the codebase, and where to record the outcome.

Status: **PENDING** — awaiting legal review.

---

## 1. Acceptance statement

**What to review:**
The exact text presented to the recipient at the moment of signing, and the text
stored in the `AcceptanceCertificate`. These must be identical (enforced by
`buildAcceptanceStatement` in `apps/api/src/modules/signing/domain/acceptance-statement.ts`).

**Evidence available:**
- Source: `apps/api/src/modules/signing/domain/acceptance-statement.ts`
- Test: `apps/api/test/signing/acceptance-statement.spec.ts` — asserts display text == stored text
- Sample output (English): *"I, [Recipient Name], accept the offer '[Offer Title]' from
  [Sender Name] ([Sender Email]) on behalf of myself or the entity I represent."*

**Legal questions to answer:**
1. Is this statement sufficient to constitute legally binding acceptance of a
   commercial offer under applicable law (Norwegian contract law / EU)?
2. Does the statement need to reference the specific offer terms, a version
   number, or a date to be enforceable?
3. Is the identity assurance provided by OTP email verification sufficient, or
   does the product need to state explicitly that acceptance is tied to email
   ownership rather than personal identity?

**Sign-off field:**
- Reviewer: ___________________________
- Date: ___________________________
- Outcome: [ ] Approved as-is  [ ] Approved with changes  [ ] Requires rework
- Notes: ___________________________

---

## 2. OTP identity assurance

**What to review:**
OfferAccept uses a 6-digit OTP sent to the recipient's email to verify identity
before accepting. The OTP is:
- Single-use (consumed on first successful verification)
- Rate-limited (5 attempts per 15-minute window per offer)
- Valid for 15 minutes

**Evidence available:**
- OTP generation: `apps/api/src/modules/signing/signing-flow.service.ts`
- Rate limit: `apps/api/src/modules/signing/signing-flow.service.ts` (rateLimiter.check)
- Expiry: `SigningSession.expiresAt`, set to `NOW() + 15 minutes`

**Legal questions to answer:**
1. Is email OTP sufficient identity assurance for the use cases OfferAccept
   targets (employment offers, commercial agreements)?
2. Should the product disclaim that OTP verifies email ownership, not personal
   identity (e.g. shared inboxes, email delegation)?
3. Is additional identity verification (e.g. BankID, eIDAS) required for
   specific deal types or jurisdictions?

**Sign-off field:**
- Reviewer: ___________________________
- Date: ___________________________
- Outcome: [ ] Approved as-is  [ ] Approved with changes  [ ] Requires rework
- Notes: ___________________________

---

## 3. GDPR lawful basis

**What to review:**
OfferAccept processes personal data (recipient name, email, IP address, user
agent, signing timestamps) on behalf of its customers (Controllers). The DPA
(`/legal/dpa`) designates OfferAccept as Processor and the customer as Controller.

**Evidence available:**
- DPA text: `apps/web/src/app/legal/dpa/page.tsx`
- DPA execution model: `apps/api/src/modules/organizations/dpa.service.ts`
- Data model: `packages/database/prisma/schema.prisma` — specifically
  `AcceptanceRecord`, `SigningEvent`, `AcceptanceCertificate`
- Erasure requests: `ErasureRequest` model + erasure service (GDPR Art. 17)

**Legal questions to answer:**
1. Is the DPA v1.0 text compliant with GDPR Art. 28 requirements?
2. Does the sub-processor list (cloud infrastructure, Resend, Stripe) need to
   be published in the DPA or as a separate annex?
3. Is the 7-year certificate retention period defensible under the storage
   limitation principle, given the legal use case (acceptance evidence)?
4. What is the lawful basis for processing for the Controller? (Likely
   "performance of a contract" under Art. 6(1)(b) — legal review should confirm
   and advise whether to state this explicitly in ToS.)
5. Are Standard Contractual Clauses (SCCs) required for all customers, or only
   EEA-based customers?

**Sign-off field:**
- Reviewer: ___________________________
- Date: ___________________________
- Outcome: [ ] Approved as-is  [ ] Approved with changes  [ ] Requires rework
- Notes: ___________________________

---

## 4. Terms of Service scope

**What to review:**
The ToS must clearly define:
- What OfferAccept does (send, sign, certify commercial offers)
- What it does not do (legal advice, identity verification beyond email)
- Liability limits for acceptance evidence being challenged in court
- Acceptable use policy (no fraud, no coercion, no regulated instruments)

**Evidence available:**
- ToS is not yet in the codebase — must be drafted.
- Privacy policy: `apps/web/src/app/privacy/` (if it exists)

**Legal questions to answer:**
1. Does the ToS adequately limit OfferAccept's liability if a certificate is
   challenged as insufficient evidence in court?
2. Should the ToS explicitly disclaim that OfferAccept does not provide
   qualified electronic signatures under eIDAS?
3. What governing law and jurisdiction clauses are appropriate given the
   customer base?
4. Is the current product feature set (no identity proofing beyond OTP) suitable
   for the stated use cases, or does the ToS need to restrict certain use cases
   (e.g. real estate, financial instruments)?

**Sign-off field:**
- Reviewer: ___________________________
- Date: ___________________________
- Outcome: [ ] Approved as-is  [ ] Approved with changes  [ ] Requires rework
- Notes: ___________________________

---

## Summary checklist

| Item | Status | Reviewer | Date |
|---|---|---|---|
| Acceptance statement text | Pending | | |
| OTP identity assurance | Pending | | |
| GDPR lawful basis + DPA | Pending | | |
| Terms of Service scope | Pending | | |

All four items must be **Approved** before external customer traffic is accepted.
Record completion in `docs/launch-gates.md` under Gate 3 — Legal.
