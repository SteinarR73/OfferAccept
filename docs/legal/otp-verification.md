---
title: OTP Identity Verification Specification
version: "1.1"
effectiveDate: "[DATO VED LANSERING]"
product: OfferAccept
immutable: true
language: "no"
---

# OfferAccept — Hva OTP-verifiseringen bekrefter og ikke bekrefter

**Versjon 1.1**

---

## 4.1 Hva er OTP-verifisering?

Før en mottaker kan akseptere et tilbud, gjennomfører systemet en obligatorisk e-post OTP-verifisering (engangspassord). Denne prosessen kan ikke omgås av mottakeren eller avsenderen.

---

## 4.2 Teknisk prosess

Basert direkte på `signing-otp.service.ts`:

1. Kode genereres med kryptografisk tilfeldig funksjon (`crypto.randomInt`) — jevn sannsynlighetsfordeling over 900 000 mulige verdier
2. Råkoden sendes til mottakerens e-postadresse via transaksjonell leverandør
3. Kun SHA-256-hash lagres i databasen — råkoden eksisterer kun i minne og i e-postleveransen og lagres aldri i klartekst
4. Mottakeren oppgir koden i grensesnittet
5. Systemet beregner SHA-256 av oppgitt kode og sammenligner med lagret hash via timing-safe sammenligning (`crypto.timingSafeEqual`) — forhindrer timing-angrep

**Sikkerhetsparametere** (direkte fra kode):

| Parameter | Verdi | Beskyttelse |
|---|---|---|
| OTP gyldighetstid | 10 minutter | Koden utløper automatisk |
| Maks forsøk per kode | 5 forsøk | Låses etter 5 feil |
| Skyvevindu for kumulativ låsing | 30 minutter | Telles på tvers av sesjoner |
| Kumulativ låsegrense | 10 feil | Mottakeren låses 30 minutter |
| Koderom | 100 000–999 999 (6 sifre) | Uniform fordeling |
| Lagringsformat | SHA-256-hash | Råkode aldri i database |

Ny OTP-forespørsel ugyldiggjør eksisterende ventende koder for samme sesjon — to aktive koder kan aldri eksistere simultaneously for samme akseptflyt.

---

## 4.3 Hva OTP-verifiseringen bekrefter

OTP-verifiseringen bekrefter **ett og bare ett faktum**:

> At den personen som fullførte akseptflyten hadde **kontroll over den oppgitte e-postadressen** på det tidspunktet aksepten fant sted.

Dette understøttes av hendelsesloggen:
- Tidsstempel for OTP-utsteding og OTP-verifisering
- IP-adresse og nettleserinformasjon på verifikasjonstidspunktet
- Den fullstendige hendelseskjeden (`SigningEvent`) med SHA-256-kjedeintegritet

---

## 4.4 Hva OTP-verifiseringen ikke bekrefter

| Det er ikke | Forklaring |
|---|---|
| Personidentitetsverifisering | Systemet verifiserer ikke at e-postinnehaveren er den oppgitte personen |
| BankID / eIDAS | Ingen kobling til nasjonale identitetsregistre |
| Kvalifisert elektronisk signatur | OfferAccept er ikke et QTSP |
| Sikker mot delt innboks | Hvem som helst med tilgang til e-postkontoen kan fullføre aksept |

---

## 4.5 Juridisk posisjonering (eIDAS)

| Nivå | Krav | OfferAccept |
|---|---|---|
| **SES** — Enkel elektronisk signatur | Ingen spesifikke tekniske krav | ✅ Leverer dokumentasjon som kan utgjøre SES |
| **AdES** — Avansert | Knyttet til signereren, egnet til å identifisere | ⚠️ E-postbinding dokumentert — ikke identitetsproofing |
| **QES** — Kvalifisert | Krever QTSP og godkjent sertifikat | ❌ Leveres ikke |

Etter norsk avtalelov § 1 kreves ikke spesifikk form for at avtaler er bindende med mindre det er særskilt bestemt i lov. E-post OTP-basert aksept vil i de fleste ordinære kommersielle avtaler og arbeidsavtaler anses som tilstrekkelig. For høyverdi-kontrakter anbefales supplerende BankID-verifisering.

---

## 4.6 Revisjonslogg og etterprøvbarhet

Alle hendelser loggføres i `SigningEvent`-tabellen med kjedeintegritet:

| Hendelsestype | Hva logges |
|---|---|
| `OTP_ISSUED` | Tidsstempel, kanal, maskert leveringsadresse |
| `OTP_ATTEMPT_FAILED` | Forsøksteller |
| `OTP_MAX_ATTEMPTS` | Utlåst etter 5 feil |
| `OTP_VERIFIED` | Tidsstempel, IP, nettleser, challenge-ID |

`CertificateService.verify()` validerer hendelseskjeden ved hvert verifiseringskall — aksept uten forutgående `OTP_VERIFIED` flagges som anomali.
