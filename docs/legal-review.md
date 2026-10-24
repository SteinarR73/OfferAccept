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
  (template version `2.0`, stored per acceptance in `acceptanceStatementVersion`)
- Test: `apps/api/test/signing/acceptance-statement.spec.ts` — asserts display text == stored text
- Public copies of the wording: `/legal/acceptance-statement` and ToS §4.1
- The exact text (English), as generated and as stored verbatim in the certificate:

  > I, [Recipient Name], confirm that I have reviewed and accept the offer "[Offer Title]"
  > (version [n], dated [date]) presented by [Sender Name] ([Sender Email]). This acceptance is
  > made via my verified email address [Recipient Email]. By confirming this acceptance, I
  > acknowledge this action as my binding agreement to the terms presented, and I confirm that I
  > have authority to bind myself or, where applicable, the legal entity I represent. This
  > confirmation constitutes an advanced electronic signature under the Norwegian Act on
  > Electronic Commerce and Other Information Society Services (ehandelsloven), and not a
  > qualified electronic signature under EU Regulation No 910/2014 (eIDAS). The exact date and
  > time of this confirmation is recorded in the certificate issued for this acceptance.

- The statement is generated in English only. The web UI also has a Norwegian locale, so a
  recipient can see a Norwegian interface around an English statement.

**Legal questions to answer:**
1. Is this statement sufficient to constitute legally binding acceptance of a
   commercial offer under applicable law (Norwegian contract law / EU)?
2. **The statement itself asserts a legal characterisation:** that the confirmation
   "constitutes an advanced electronic signature under … ehandelsloven". Is that statute the
   right one, and is the characterisation defensible for an email-OTP confirmation? If not, the
   sentence should be changed before launch — it is stored in every certificate.
3. Is an English-only statement acceptable for Norwegian-speaking recipients?
4. Is the identity assurance provided by OTP email verification sufficient, or
   does the product need to state explicitly that acceptance is tied to email
   ownership rather than personal identity? (The statement already says "via my verified
   email address".)

**Sign-off field:**
- Reviewer: ___________________________
- Date: ___________________________
- Outcome: [ ] Approved as-is  [ ] Approved with changes  [ ] Requires rework
- Notes: ___________________________

---

## 2. OTP identity assurance

**What to review:**
OfferAccept uses a 6-digit OTP sent to the recipient's email to verify identity
before accepting. Verified against the code and a running system (2026-10-24):

- 6 digits, generated with `crypto.randomInt` (uniform); only a SHA-256 hash is stored
- Valid for **10 minutes** (`OTP_TTL_MS`)
- At most **5 wrong attempts per challenge**, then the challenge is locked; **10 cumulative
  failures per recipient** across challenges within 30 minutes lock the recipient
- Issuance limited to 3 per signing link per hour; verification limited per IP
  (10 / 15 min plus a 3 / 10 s burst limit)
- Accepting requires a verified challenge; a second accept on the same link is refused
  (15 concurrent accept requests on one verified link produced exactly one acceptance)
- The signing session lasts **4 hours** (`SESSION_TTL_MS`)
- The signing link itself is a 256-bit random token valid for 30 days by default
  (`TOKEN_EXPIRY_DAYS`); only its hash is stored

(An earlier version of this document stated 15-minute validity and a 15-minute session; the
code values above are authoritative.)

**Evidence available:**
- OTP generation / limits: `apps/api/src/modules/signing/services/signing-otp.service.ts`
- Session lifetime: `apps/api/src/modules/signing/services/signing-session.service.ts`
- Rate-limit profiles: `apps/api/src/common/rate-limit/rate-limit.service.ts`
- Public description: `/legal/otp-verification`

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
- Erasure requests: `ErasureRequest` model + `apps/api/src/modules/account/account.service.ts`
- Published pages: `/privacy`, `/legal/gdpr`, `/legal/dpa`, `/legal/subprocessors`,
  `/legal/cookies`; sources also under `docs/legal/`

**Personal data stored in the evidence tables (per acceptance):** recipient name and verified
email, IP address, user agent, locale, timezone, acceptance timestamps, and the full
acceptance statement (which itself contains name, email and the sender's name and email).
`SigningEvent` rows additionally carry IP and user agent per event.

**Retention and erasure — what the system actually does (counsel should assess this, not
assume the earlier "7-year" wording):**

- The evidence tables (`AcceptanceRecord`, `OfferSnapshot`, `OfferSnapshotDocument`,
  `SigningEvent`, and the certificates) have **no retention limit and no deletion path**.
  Since 2026-10-24 the database itself rejects UPDATE/DELETE/TRUNCATE on them (triggers),
  so even an operator cannot erase a data subject's rows without deliberately removing the
  triggers.
- `ACCEPTANCE_RETENTION_YEARS` (default **10**) only controls purging of *mutable* signing
  session data (`SigningSession`, `SigningOtpChallenge`). It does not apply to the evidence.
- A GDPR erasure request is a manual operator workflow that deletes or anonymises the user
  account and tokens and **explicitly preserves** the evidence rows (see the comment in
  `requestErasure`; DPA clause 9).

**Legal questions to answer:**
1. Is the DPA v1.0 text compliant with GDPR Art. 28 requirements?
2. Does the sub-processor list (cloud infrastructure, Resend, Stripe) need to
   be published in the DPA or as a separate annex?
3. Is indefinite retention of acceptance evidence, with erasure requests refused for those
   rows, defensible (e.g. Art. 17(3)(e), establishment/exercise/defence of legal claims)?
   If a fixed period is required, what is it? (The earlier text assumed 7 years; the code
   does not implement any period for evidence.)
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

- ToS exists and is published: `apps/web/src/app/legal/terms/` (current plus archived
  `v1.1` and `v1.2`), `/terms`, source copy `docs/legal/terms-of-service.md`
- Acceptable-use policy: `/legal/aup`; privacy policy: `/privacy`
- What the certificate does and does not prove: `docs/certificates.md` §5–6

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
Record completion in `docs/launch-gates.md` under Gate 4 — Legal and Compliance.

*Facts in the "Evidence" sections were re-verified against the code and a running system on
2026-10-24. The sign-off fields and legal questions are untouched and remain for counsel.*
