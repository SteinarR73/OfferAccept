---
title: Legitimate Interest Assessment (LIA)
version: "1.0"
status: draft
effectiveDate: "[DATE AT LAUNCH]"
product: OfferAccept
requiresLegalReview: true
---

# Legitimate Interest Assessment — OfferAccept

> **Status:** Draft. Must be reviewed and signed off by a qualified lawyer or DPO before launch.

This document records the three-part legitimate interest assessment for OfferAccept's processing of recipient personal data when a sender shares a document for acceptance.

---

## 1. Purpose Test

**What is the purpose of the processing?**

OfferAccept records verifiable evidence that a named recipient confirmed acceptance of a specific document at a specific time. The processing supports:

- The sender's legitimate need to prove that a counterparty accepted a commercial document (offer letter, service agreement, scope of work, NDA, etc.).
- The recipient's own interest in having an independent, tamper-evident record of what they agreed to and when.
- The platform's operational security and fraud prevention (IP logging, OTP verification).

**Is the purpose legitimate?**

Yes. Establishing and preserving evidence of commercial acceptance is a recognised legitimate interest under GDPR Recital 47. It is analogous to retaining signed paper contracts. The sender has a genuine business need to be able to demonstrate acceptance in the event of a dispute.

**Could the same purpose be achieved without processing personal data?**

No. The verifiability of acceptance depends on tying the acceptance event to a specific identified recipient. An anonymous acceptance record would carry no evidentiary value.

---

## 2. Necessity Test

**Is the processing necessary for the stated purpose?**

| Data element | Why necessary |
|---|---|
| Recipient email address | Identifies the individual; OTP delivery proves inbox control; included in certificate |
| Name (optional, sender-provided) | Identifies the counterparty in the certificate |
| IP address at acceptance | Corroborating evidence; standard in commercial acceptance systems |
| User agent (browser/OS) | Corroborating evidence; helps detect automation attacks |
| Acceptance timestamp (UTC) | Core evidential element — the *when* of acceptance |
| OTP code hash (never plaintext) | Proves the recipient controlled the inbox at acceptance time |

**Are the data minimised?**

Yes. OTP codes are stored only as SHA-256 hashes. Mutable session data (SigningSession, SigningOtpChallenge) is deleted after the configurable retention period (default 10 years for legal claim support, 1 year for OTP data). Immutable evidence tables are retained under GDPR Art. 17(3)(e).

**Is there a less intrusive alternative?**

The minimum viable evidence set is: verified email, timestamp, document hash, and acceptance statement hash. All are collected. No additional data beyond this set is collected from recipients.

---

## 3. Balancing Test

**Would the processing cause undue harm to the recipients?**

The following factors are considered:

| Factor | Assessment |
|---|---|
| Nature of the data | Ordinary personal data (email, IP, timestamp). No special category data. |
| Reasonable expectation | Recipients are sent a business document for acceptance. Recording the acceptance is a normal, expected consequence of the transaction. |
| Relationship | Transactional. The recipient is a counterparty to a commercial arrangement initiated by the sender. |
| Impact on the individual | Low. The data is used solely to evidence an act the recipient voluntarily performed. |
| Safeguards | TLS in transit. Tokens stored as SHA-256 hashes only. Access logged. Data minimisation applied. Retention limits enforced by automated purge jobs. |
| Right to object | Recipients may contact the sender (the controller) to exercise rights. Erasure requests are assessed individually; immutable evidence records are retained under Art. 17(3)(e). |

**Conclusion:**

The processing is proportionate to the legitimate purpose. The sender's need for verifiable acceptance evidence outweighs the minimal privacy intrusion on the recipient, given the safeguards applied and the recipient's reasonable expectation that accepting a commercial document will be recorded.

---

## 4. Balancing Mitigations

The following measures are applied to reduce the risk to recipients:

1. **Article 14 notice** — Rendered before the OTP step on every acceptance. Recipients are told what is recorded and why before they proceed.
2. **Link to privacy policy** — Provided in the Article 14 notice block.
3. **Token expiry** — Signing links expire automatically (default 30 days). Expired links are rejected.
4. **Token invalidation on acceptance** — The signing link is permanently invalidated when acceptance is recorded.
5. **OTP hashing** — The 6-digit code is never stored in plaintext.
6. **Automated data lifecycle** — Mutable session data is purged on a daily cron schedule after the retention period.

---

## 5. Open Items (requires legal confirmation)

- [ ] Confirm the controller/processor split (see `controller-model.md`) with a qualified DPO before launch.
- [ ] Confirm that Art. 17(3)(e) applies to AcceptanceRecord, OfferSnapshot, and SigningEvent in the target jurisdiction.
- [ ] Confirm retention period (default 10 years) is appropriate for the legal claim support purpose under applicable national law.
- [ ] Review whether SMS OTP (if added) changes the balancing test.
- [ ] Confirm that the Article 14 notice text in `signing-client.tsx` satisfies Art. 14(1)–(2) in all target EEA member states.

---

*This assessment was prepared by the engineering team and has not yet been reviewed by a DPO or external legal counsel. It must not be relied upon as legal advice.*
