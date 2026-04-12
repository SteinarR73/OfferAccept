---
title: GDPR Processing Statement
version: "1.1"
effectiveDate: "[DATO VED LANSERING]"
product: OfferAccept
immutable: true
language: "no"
---

# OfferAccept — GDPR behandlingsgrunnlag og behandleroversikt

**Versjon 1.1** | Gjelder fra: [DATO VED LANSERING]

---

## 3.1 Roller etter GDPR

| Rolle | Part |
|---|---|
| **Behandlingsansvarlig** | Kunden — organisasjonen som sender tilbud via OfferAccept |
| **Databehandler** | OfferAccept — behandler data utelukkende etter instruks fra behandlingsansvarlig |
| **Underbehandlere** | Se punkt 3.5 — godkjent skriftlig, endringer varsles |

---

## 3.2 Behandlingsgrunnlag

### For behandlingsansvarlig (Kunden)

Kunden behandler mottakernes personopplysninger primært med hjemmel i **GDPR artikkel 6 nr. 1 bokstav b** — behandlingen er nødvendig for å oppfylle en avtale som mottakeren er part i, eller for å gjennomføre tiltak på mottakerens forespørsel før avtaleinngåelse. For rene B2B-tilbud kan **artikkel 6 nr. 1 bokstav f** (berettiget interesse i å dokumentere avtaleinngåelse) også være aktuelt. Kunden er ansvarlig for å kartlegge og dokumentere sitt eget grunnlag og informere mottakerne etter artikkel 13/14.

### For OfferAccept som databehandler

OfferAccept behandler personopplysninger utelukkende på instruks fra behandlingsansvarlig, jf. GDPR artikkel 28, undergitt databehandleravtalen (DPA).

---

## 3.3 Kategorier av personopplysninger og formål

| Kategori | Formål | Grunnlag |
|---|---|---|
| Mottakers navn og e-post | Levering, OTP-verifisering, sertifikat | Art. 28-instruks |
| IP-adresse og nettleserdata | Bevislogg, sikkerhet og misbruksvern | Berettiget interesse (bevisintegritet) |
| OTP-verifiseringspost (kun hash — aldri råkode) | Bevis for e-postkontroll | Art. 28-instruks |
| Tidsstempel for aksept (UTC) | Sertifikatinnhold, bevislogg | Art. 28-instruks |
| Tilbudstittel og akseptbeslutning | Sertifikatinnhold | Art. 28-instruks |

> OTP-koder lagres aldri i klartekst. Kun en kryptografisk SHA-256-hash av koden lagres i databasen.

---

## 3.4 Datalagring, sletting og begrensning

| Datatype | Oppbevaringstid | Begrunnelse |
|---|---|---|
| Akseptsertifikat og akseptpost | Min. 7 år etter aksept | Dokumentasjonsformål, potensielle rettslige tvister |
| Signeringslogger og hendelseslogg | 18 måneder aktiv, deretter arkiv | Operasjonell integritet og revisjon |
| Sesjonsinformasjon og OTP-data | Slettes etter fullført flyt / utløp | Minimumsprinsippet (GDPR art. 5(1)(e)) |
| Kontodata | Aktiv kontoperiode + 30 dager etter oppsigelse | Nødvendig for tjenestens drift |

### Rett til sletting — GDPR artikkel 17

Registrerte kan sende slettingsforespørsel via `POST /api/v1/account/erasure-request`. Der sletting er uforenlig med rettslige forpliktelser eller dokumentasjonsformål, vil behandlingen begrenses i stedet for at data slettes, jf. GDPR artikkel 17 nr. 3 bokstav b og e. Akseptsertifikater faller inn under denne kategorien — sletting ville ugyldiggjøre sertifikatets SHA-256-fingeravtrykk og ødelegge bevisintegriteten. Begrensningen dokumenteres i slettingssvar og operatørlogg.

---

## 3.5 Underbehandlere

| Underbehandler | Tjeneste | Overføringsgrunnlag |
|---|---|---|
| Skyinfrastruktur (hosting/database) | Applikasjons- og databasehosting | EØS eller under SCCs |
| Transaksjonell e-post (Resend) | OTP-levering og varsler | EØS eller under SCCs |
| Betalingsprosessering (Stripe) | Abonnementsfakturering | SCCs |

OfferAccept vil gi rimelig forhåndsvarsel om materielle endringer i underbehandlerlisten.

---

## 3.6 Internasjonale overføringer

Overføringer av personopplysninger fra EØS skjer under Standardkontraktsklausuler (SCCs) vedtatt av EU-kommisjonen (Kommisjonsbeslutning 2021/914). En signert kopi av SCC-ene er tilgjengelig på forespørsel fra [privacy@offeraccept.com](mailto:privacy@offeraccept.com).

---

## 3.7 Den registrertes rettigheter

Mottakere kan utøve følgende rettigheter overfor behandlingsansvarlig (Kunden):

- **Innsyn** (art. 15) — hvilke opplysninger behandles
- **Retting** (art. 16) — korrigere uriktige opplysninger
- **Sletting** (art. 17) — der dette ikke er i konflikt med bevissikringsformål (se 3.4)
- **Begrensning** (art. 18) — begrenset behandling der sletting ikke er mulig
- **Dataportabilitet** (art. 20) — eksport via `GET /api/v1/account/export`

---

## 3.8 Datatilsyn og klagerett

Registrerte har rett til å klage til [Datatilsynet](https://www.datatilsynet.no) i Norge, eller til nasjonal datatilsynsmyndighet i sitt eget EU/EØS-land.
