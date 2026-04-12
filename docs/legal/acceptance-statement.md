---
title: Acceptance Statement Specification
version: "1.1"
effectiveDate: "[DATO VED LANSERING]"
product: OfferAccept
immutable: true
language: "no"
---

# OfferAccept — Teknisk og juridisk spesifikasjon av aksepterklæringen

**Versjon 1.1**

---

## 2.1 Den eksakte erklæringsteksten

Følgende tekst genereres av `buildAcceptanceStatement()` på serveren og er identisk i visningsflaten og i det lagrede sertifikatet:

> *«I, [Recipient Name], confirm that I have reviewed and accept the offer "[Offer Title]" presented by [Sender Name] ([Sender Email]). By confirming this acceptance, I acknowledge this action as my binding agreement to the terms presented.»*

**Eksempel med faktiske verdier:**

> *«I, Kari Nordmann, confirm that I have reviewed and accept the offer "Ansettelsestilbud – Seniorutvikler" presented by Steinar Reilstad (steinar@bedrift.no). By confirming this acceptance, I acknowledge this action as my binding agreement to the terms presented.»*

---

## 2.2 Hva mottakeren bekrefter

Ved å fullføre akseptflyten bekrefter mottakeren tre ting:

1. At de har **gjennomgått tilbudet** slik det ble presentert i akseptgrensesnittet
2. At de **aksepterer tilbudet** med den angitte tittelen fra den angitte avsenderen
3. At handlingen er **bindende** — mottakeren anerkjenner dette som en bindende avtale

---

## 2.3 Hva erklæringen ikke bekrefter

Aksepterklæringen dokumenterer **ikke**:

- At mottakeren er den personen de hevder å være (kun at de kontrollerte den angitte e-postadressen på aksepttidspunktet)
- At mottakeren hadde rettslig handleevne
- At mottakeren handlet uten press eller tvang
- At innholdet i tilbudsdokumentet er juridisk bindende i alle jurisdiksjoner

---

## 2.4 Teknisk integritet

| Egenskap | Implementasjon |
|---|---|
| Serverside-generert | Klienten kontrollerer ingen del av erklæringsteksten |
| Visning = lagring | Samme funksjon brukes på begge steder; tester verifiserer byte-for-byte likhet |
| Frysing ved sending | Teksten bygges fra `OfferSnapshot` — fryst på sendingstidspunkt, ikke ved aksept |
| SHA-256-fingeravtrykk | Akseptposten hashes og lagres i sertifikatet — enhver endring er detekterbar |
| Tidsstempel separat | `acceptedAt` lagres separat i `AcceptanceRecord` — ikke innbakt i erklæringsteksten |
| OTP-koder | Lagres aldri i klartekst — kun kryptografisk SHA-256-hash av koden lagres |

---

## 2.5 Juridisk posisjonering (eIDAS)

| Signaturnivå | Krav | OfferAccept-status |
|---|---|---|
| **SES** — Enkel elektronisk signatur | Ingen spesifikke tekniske krav | ✅ Leverer bevis som kan utgjøre en SES |
| **AdES** — Avansert elektronisk signatur | Knyttet til signereren, egnet til å identifisere | ⚠️ E-postbinding dokumentert, men ikke identitetsproofing |
| **QES** — Kvalifisert elektronisk signatur | Krever QTSP og godkjent sertifikat | ❌ Leveres ikke av OfferAccept |
