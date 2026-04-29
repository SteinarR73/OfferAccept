---
title: Controller / Processor Model
version: "1.0"
status: draft
effectiveDate: "[DATE AT LAUNCH]"
product: OfferAccept
requiresLegalReview: true
---

# Controller / Processor Model — OfferAccept

> **Status:** Draft. Requires confirmation by a qualified DPO or legal counsel before launch.

---

## 1. The question

GDPR assigns distinct obligations to controllers (who determine the purposes and means of processing) and processors (who process on a controller's behalf). The correct characterisation of OfferAccept's role determines which party must provide the Article 13/14 notice, who bears erasure obligation, who must maintain the Record of Processing Activities (RoPA), and who must enter a Data Processing Agreement (DPA) with the other.

---

## 2. How the data flows

```
Sender (Customer organisation)
  │
  ├── Creates an offer → uploads document → sets recipient email
  │
  └── Sends the deal via OfferAccept
        │
        └── OfferAccept delivers link to Recipient
              │
              └── Recipient accepts → AcceptanceRecord created
                    │
                    └── Certificate issued → available to Sender
```

The sender determines:
- **Who** is targeted (recipient email, name)
- **What** is being accepted (document content, deal title, message)
- **When** the deal expires

OfferAccept determines:
- The technical means of delivery (email link, OTP)
- The evidence model (hash chain, event log, certificate)
- The data retention schedule

---

## 3. Interpretation A — Sender is controller, OfferAccept is processor

Under this interpretation:

| Party | Role |
|---|---|
| Sender (Customer) | **Controller** — determines purposes and means for the recipient's data |
| OfferAccept | **Processor** — processes recipient data on the sender's instructions |

**Implications:**
- A Data Processing Agreement (DPA) between OfferAccept and each customer is mandatory (Art. 28).
- The sender must provide the Article 13 notice to recipients (not OfferAccept's obligation).
- OfferAccept's Article 14 notice (currently rendered before OTP) is a supplementary courtesy, not a legal obligation on OfferAccept.
- The sender bears erasure and access request obligations vis-à-vis recipients.
- OfferAccept's own processing (security logs, billing) is separate and OfferAccept is controller for that.

**Argument in favour:** The sender initiates the relationship, selects the recipient, and is the beneficiary of the evidence. OfferAccept is the technical infrastructure that executes the sender's instruction.

---

## 4. Interpretation B — OfferAccept is a joint controller (or independent controller for some processing)

Under this interpretation:

| Party | Role |
|---|---|
| Sender (Customer) | **Controller** for the underlying commercial transaction |
| OfferAccept | **Joint controller** for the evidence record; independent **controller** for platform security/fraud prevention |

**Implications:**
- Joint controller agreement required (Art. 26).
- OfferAccept must provide the Art. 14 notice directly (already done — in signing-client.tsx before OTP).
- OfferAccept must maintain its own RoPA covering recipient data.
- Erasure requests addressed to OfferAccept must be assessed against Art. 17(3)(e).

**Argument in favour:** OfferAccept determines the evidence schema, hash algorithm, retention policy, and the format of the certificate. It is not merely executing mechanical instructions but applying its own independent judgment about how to process the data. The certificate is issued under OfferAccept's own brand and infrastructure.

---

## 5. Current implementation stance

The current codebase is implemented under Interpretation A (processor model) as the baseline, with Article 14 notice shown regardless (which satisfies either interpretation):

- `GDPR-statement.md` describes OfferAccept as processor (Art. 28)
- The Article 14 notice in `signing-client.tsx` mentions the sender by name as the controller
- A DPA template should be prepared and attached to the Terms of Service

**However:** this interpretation requires legal confirmation. If the platform is found to be a joint controller, the DPA must be replaced with a joint controller agreement, and the privacy notice must be updated to reflect OfferAccept as a controller.

---

## 6. Actions required before launch

- [ ] Engage DPO or external GDPR counsel to confirm the correct characterisation.
- [ ] If Interpretation A: prepare DPA template; attach to Terms; gate activation on DPA acceptance.
- [ ] If Interpretation B: prepare joint controller agreement; update privacy notice; confirm Art. 14 notice text.
- [ ] Update `gdpr-statement.md` with the confirmed interpretation and effective date.
- [ ] Add DPA acceptance checkbox to the signup flow (for the sender/customer).
- [ ] Create `POST /api/v1/account/dpa-accept` endpoint to record acceptance timestamp (or embed in Terms acceptance flow).

---

## 7. Sub-processors

Regardless of interpretation, OfferAccept uses the following sub-processors for recipient data:

| Sub-processor | Purpose | Transfer basis |
|---|---|---|
| Cloud database host (PostgreSQL) | Stores AcceptanceRecord, OfferSnapshot, SigningEvent | EEA or SCCs |
| Object storage (S3-compatible) | Stores certificate PDFs | EEA or SCCs |
| Email provider (Resend) | Delivers OTP codes and notifications | EEA or SCCs |

Customers (senders) must be notified of sub-processor changes with reasonable advance notice.

---

*This document was prepared by the engineering team for internal review. It is not legal advice and must not be relied upon as such. Obtain qualified legal opinion before determining and publishing the final controller/processor characterisation.*
