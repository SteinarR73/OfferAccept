# OfferAccept v1 — Launch Scope

This document is the authoritative scope boundary for the v1 launch.
It exists to prevent scope creep during stabilization and to give the team a
clear "in / out" reference when evaluating feature requests or bug fixes.

**Rule:** If something is listed as out of scope, it must not be built,
enabled, or partially shipped before GA — even as an experiment. Out-of-scope
features can be added to the post-launch roadmap.

---

## In scope for v1 launch

These capabilities must work reliably before any customer traffic is accepted.

| Capability | What it means |
|---|---|
| **Create deal** | Sender creates a named deal, optionally attaches a document or selects a template |
| **Send deal** | Sender sends the deal; recipient receives a secure email with a signing link |
| **Recipient opens link** | Recipient follows the link and sees the deal content |
| **OTP verification** | Recipient proves email ownership via a one-time code before accepting |
| **Deal acceptance** | Recipient confirms acceptance; an immutable acceptance record is created |
| **Certificate generation** | An acceptance certificate is generated automatically upon acceptance |
| **Public certificate verification** | Any third party can verify a certificate via `GET /certificates/:id/verify` |
| **Reminder system** | Automated reminders at 24 h, 72 h, and 5 days after sending; stop on terminal state |
| **Activity timeline** | Per-deal timeline sourced from DealEvent records |
| **Basic analytics** | Sent count, accepted count, acceptance rate, median acceptance time — from DealEvent |

---

## Out of scope for v1 launch

These must not be introduced during the stabilization or launch window.
Open a post-launch roadmap issue for anything in this list.

| Category | What is excluded |
|---|---|
| **CRM features** | Contact management, lead tracking, company records, pipelines |
| **Proposal builder** | Rich-text editors, clause libraries, dynamic pricing blocks |
| **Document editing** | In-app document creation or annotation |
| **Pricing / quote builder** | Line-item pricing, discount rules, quote templates |
| **Pipeline tracking** | Deal stages, kanban views, funnel visualisations |
| **Advanced analytics** | Custom date ranges, segment breakdowns, export, cohort analysis |
| **Team management** | Org-level role assignment UI, seat management, invite flows beyond basic auth |
| **Integrations** | Webhooks (already built but not exposed as a customer feature), CRM sync, Zapier, Slack |
| **Electronic signature (QES)** | Qualified signatures under eIDAS or equivalent — OfferAccept is not an e-sign platform |
| **Multi-recipient deals** | v1 enforces one recipient per deal at the database level |
| **Document annotation / redlining** | Recipients cannot mark up or comment on documents |

---

## Product positioning guardrails

These constraints apply to copy, onboarding, and any customer-facing content
shipped before or at GA.

- The product must be described as a **deal acceptance** or **agreement confirmation**
  platform — not as an electronic signature tool.
- The certificate proves email-based intent and identity, not a qualified legal signature.
- Messaging must not imply QES-level legal standing.
- Pricing must reflect deal-acceptance value, not signature volume.

---

## Scope change process

Any request to add something from the "out of scope" list — or anything not
covered by this document — requires:

1. A written justification explaining why it is a launch blocker (not a nice-to-have).
2. Agreement from the product lead.
3. An update to this file before work begins.

Requests that do not meet this bar go to the post-launch backlog.

---

## Related documents

- [launch-gates.md](launch-gates.md) — pre-launch technical checklist (Gates 1–6)
- [architecture.md](architecture.md) — system design and domain model
- [operations.md](operations.md) — runbook and infrastructure requirements
- [certificates.md](certificates.md) — certificate verification specification
- [support.md](support.md) — support tooling and dispute handling
